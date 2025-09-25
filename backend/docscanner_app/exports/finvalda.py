# backend/docscanner_app/exports/finvalda.py
import xml.etree.ElementTree as ET
from xml.dom import minidom
from django.utils.encoding import smart_str

from .formatters import format_date, get_price_or_zero, expand_empty_tags
# vat_to_int_str не нужен: pvm_proc берём из LineItem.vat_percent

FNS = {"xsi": "http://www.w3.org/2001/XMLSchema-instance"}


def _pretty_bytes(elem: ET.Element) -> bytes:
    """
    Возвращает красивый XML (bytes) с декларацией, без пустых строк.
    """
    rough = ET.tostring(elem, encoding="utf-8")
    parsed = minidom.parseString(rough)
    xml = parsed.toprettyxml(indent="  ", encoding="utf-8")
    lines = [l for l in xml.decode("utf-8").split("\n") if l.strip()]
    return "\n".join(lines).encode("utf-8")


def _root() -> ET.Element:
    """
    Создаёт корневой <fvsdata> с обязательными секциями.
    """
    root = ET.Element("fvsdata", {"xmlns:xsi": FNS["xsi"]})
    ET.SubElement(root, "klientai")
    ET.SubElement(root, "prekes")      # пока пусто, но оставляем раздел
    ET.SubElement(root, "operacijos")
    return root


def _select_client_code(*values) -> str:
    """
    Возвращает первый непустой из значений, иначе "neraimoneskodo".
    """
    for v in values:
        sv = smart_str(v or "")
        if sv.strip():
            return sv
    return "neraimoneskodo"


def _ensure_client(
    root: ET.Element,
    *,
    code: str,
    name: str,
    address: str = "",
    iban: str = "",
    country_iso: str = "LT",
):
    """
    Добавляет клиента в <klientai>, если его ещё нет (по коду).
    Маппинг:
      <kodas> = code
      <pavadinimas> = name
      <adresas> = address
      <banko_sas> = iban
      <im_kodas> = code
      <salis_kodas> = country_iso
    """
    klientai = root.find("klientai")
    assert klientai is not None

    code = smart_str(code or "")
    for k in klientai.findall("klientas"):
        k_code = (k.findtext("kodas") or "").strip()
        if k_code == code:
            return  # уже есть

    klientas = ET.SubElement(klientai, "klientas")
    ET.SubElement(klientas, "kodas").text = code
    ET.SubElement(klientas, "pavadinimas").text = smart_str(name or "")
    ET.SubElement(klientas, "adresas").text = smart_str(address or "")
    ET.SubElement(klientas, "banko_sas").text = smart_str(iban or "")
    ET.SubElement(klientas, "im_kodas").text = code
    ET.SubElement(klientas, "salis_kodas").text = smart_str(country_iso or "LT")


def _fill_line(
    parent: ET.Element,
    *,
    is_purchase: bool,  # оставлено для возможной логики в будущем
    line_obj=None,
    currency: str = "EUR",
    fallback_amount_wo_vat=None,
    fallback_vat_amount=None,
    fallback_name: str = "",
    pvm_kodas_value=None,  # НОВОЕ: явное значение pvm_kodas (multi/single)
):
    """
    Добавляет <eilute> в <operacijaDet>.

    - <tipas> = "1" если preke_paslauga == "preke", иначе "2"
    - <kodas> = prekes_kodas или prekes_barkodas, иначе "neraprekeskodo"
    - <kiekis pirmas_mat="true"> = quantity (по умолчанию 1.00)
    - <sandelis> = sandelio_kodas
    - <pavadinimas> = prekes_pavadinimas или fallback_name
    - суммы:
        если EUR:
            <suma_l> = subtotal, <suma_pvml> = vat, <suma_v>=0, <suma_pvmv>=0
        иначе:
            <suma_v> = subtotal, <suma_pvmv> = vat, <suma_l>=0, <suma_pvml>=0
      (subtotal/ vat берём из строки; если строк нет — из fallback)
    - <pvm_proc> = line_obj.vat_percent (или 0.00, если нет)
    - <pvm_kodas>:
        * если передан pvm_kodas_value — используем его,
        * иначе line_obj.pvm_kodas,
        * иначе пусто.
    """
    eilute = ET.SubElement(parent, "eilute")

    # tipas
    preke_paslauga = getattr(line_obj, "preke_paslauga", None) if line_obj is not None else None
    tipas_val = "1" if (preke_paslauga and str(preke_paslauga).lower() == "preke") else "2"
    ET.SubElement(eilute, "tipas").text = tipas_val

    # kodas: prekes_kodas -> prekes_barkodas -> "нерaprekeskodo"
    prekes_kodas = getattr(line_obj, "prekes_kodas", None) if line_obj is not None else None
    prekes_barkodas = getattr(line_obj, "prekes_barkodas", None) if line_obj is not None else None
    kodas_val = prekes_kodas or prekes_barkodas or "neraprekeskodo"
    ET.SubElement(eilute, "kodas").text = smart_str(kodas_val)

    # kiekis
    qty = getattr(line_obj, "quantity", None) if line_obj is not None else None
    if qty is None:
        qty = 1
    ET.SubElement(eilute, "kiekis", {"pirmas_mat": "true"}).text = f"{float(qty):.2f}"

    # sandelis
    sandelio_kodas = getattr(line_obj, "sandelio_kodas", None) if line_obj is not None else ""
    ET.SubElement(eilute, "sandelis").text = smart_str(sandelio_kodas or "")

    # pavadinimas
    name = getattr(line_obj, "prekes_pavadinimas", None) if line_obj is not None else None
    ET.SubElement(eilute, "pavadinimas").text = smart_str(name or fallback_name or "")

    # суммы
    if line_obj is not None:
        subtotal = getattr(line_obj, "subtotal", None)
        vat_amount = getattr(line_obj, "vat", None)
    else:
        subtotal = fallback_amount_wo_vat
        vat_amount = fallback_vat_amount

    cur = (currency or "EUR").upper()
    if cur == "EUR":
        ET.SubElement(eilute, "suma_v").text = "0"
        ET.SubElement(eilute, "suma_l").text = get_price_or_zero(subtotal)
        ET.SubElement(eilute, "suma_pvmv").text = "0"
        ET.SubElement(eilute, "suma_pvml").text = get_price_or_zero(vat_amount)
    else:
        ET.SubElement(eilute, "suma_v").text = get_price_or_zero(subtotal)
        ET.SubElement(eilute, "suma_l").text = "0"
        ET.SubElement(eilute, "suma_pvmv").text = get_price_or_zero(vat_amount)
        ET.SubElement(eilute, "suma_pvml").text = "0"

    # pvm_proc
    vat_percent = getattr(line_obj, "vat_percent", None) if line_obj is not None else None
    if vat_percent is None or vat_percent == "":
        pvm_proc_text = "0.00"
    else:
        try:
            pvm_proc_text = f"{float(vat_percent):.2f}"
        except Exception:
            pvm_proc_text = "0.00"
    ET.SubElement(eilute, "pvm_proc").text = pvm_proc_text

    # pvm_kodas: из параметра (multi) или из строки (single)
    if pvm_kodas_value is None:
        pvm_kodas_value = getattr(line_obj, "pvm_kodas", None) if line_obj is not None else ""
    ET.SubElement(eilute, "pvm_kodas").text = smart_str(pvm_kodas_value or "")


def export_pirkimai_group_to_finvalda(documents):
    """
    Экспорт ПРИОБРЕТЕНИЙ (pirkimas) в формат Finvalda.
    Возвращает bytes (полный XML c <fvsdata>).
    """
    root = _root()
    operacijos = root.find("operacijos")
    assert operacijos is not None

    for doc in documents:
        currency = getattr(doc, "currency", "EUR") or "EUR"
        series = smart_str(getattr(doc, "document_series", "") or "")
        number = smart_str(getattr(doc, "document_number", "") or "")

        invoice_date = getattr(doc, "invoice_date", None)
        op_date = getattr(doc, "operation_date", None)
        payment_date = op_date or invoice_date

        # Код контрагента: seller_id -> seller_vat_code -> "neraimoneskodo"
        seller_code = _select_client_code(
            getattr(doc, "seller_id", None),
            getattr(doc, "seller_vat_code", None),
        )
        seller_name = smart_str(getattr(doc, "seller_name", "") or "")
        seller_addr = smart_str(getattr(doc, "seller_address", "") or "")
        seller_iban = smart_str(getattr(doc, "seller_iban", "") or "")
        seller_country = smart_str(getattr(doc, "seller_country_iso", "") or "LT")

        _ensure_client(
            root,
            code=seller_code,
            name=seller_name or "No Supplier",
            address=seller_addr or "",
            iban=seller_iban or "",
            country_iso=seller_country or "LT",
        )

        pirkimas = ET.SubElement(operacijos, "pirkimas")
        ET.SubElement(pirkimas, "serija").text = series
        ET.SubElement(pirkimas, "dokumentas").text = number
        ET.SubElement(pirkimas, "data").text = format_date(invoice_date)
        ET.SubElement(pirkimas, "valiuta").text = currency.upper()
        ET.SubElement(pirkimas, "mokejimo_data").text = format_date(payment_date)
        ET.SubElement(pirkimas, "reg_data").text = format_date(invoice_date)
        ET.SubElement(pirkimas, "dokumento_data").text = format_date(invoice_date)

        k = ET.SubElement(pirkimas, "klientas", {"kodo_tipas": "im_kodas"})
        k.text = seller_code

        ET.SubElement(pirkimas, "pastaba").text = smart_str(getattr(doc, "preview_url", "") or "")
        ET.SubElement(pirkimas, "imp_param").text = "VA"

        det = ET.SubElement(pirkimas, "operacijaDet")

        # multi/single источник pvm кодов по строкам
        line_map = getattr(doc, "_pvm_line_map", None)

        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, "all") and line_items.exists():
            for item in line_items.all():
                if line_map is not None:  # multi
                    code = (line_map or {}).get(getattr(item, "id", None))
                else:  # single
                    code = getattr(item, "pvm_kodas", None)

                _fill_line(
                    det,
                    is_purchase=True,
                    line_obj=item,
                    currency=currency,
                    pvm_kodas_value=code,
                )
        else:
            _fill_line(
                det,
                is_purchase=True,
                line_obj=None,
                currency=currency,
                fallback_amount_wo_vat=getattr(doc, "amount_wo_vat", None),
                fallback_vat_amount=getattr(doc, "vat_amount", None),
                fallback_name=smart_str(getattr(doc, "prekes_pavadinimas", "") or ""),
                pvm_kodas_value=getattr(doc, "pvm_kodas", None),
            )

    xml_bytes = _pretty_bytes(root)
    return expand_empty_tags(xml_bytes)


def export_pardavimai_group_to_finvalda(documents):
    """
    Экспорт ПРОДАЖ (pardavimas) в формат Finvalda.
    Возвращает bytes (полный XML c <fvsdata>).
    """
    root = _root()
    operacijos = root.find("operacijos")
    assert operacijos is not None

    for doc in documents:
        currency = getattr(doc, "currency", "EUR") or "EUR"
        series = smart_str(getattr(doc, "document_series", "") or "")
        number = smart_str(getattr(doc, "document_number", "") or "")

        invoice_date = getattr(doc, "invoice_date", None)
        op_date = getattr(doc, "operation_date", None)
        payment_date = op_date or invoice_date

        # Код контрагента: buyer_id -> buyer_vat_code -> "neraimoneskodo"
        buyer_code = _select_client_code(
            getattr(doc, "buyer_id", None),
            getattr(doc, "buyer_vat_code", None),
        )
        buyer_name = smart_str(getattr(doc, "buyer_name", "") or "No Buyer")
        buyer_addr = smart_str(getattr(doc, "buyer_address", "") or "Lithuania")
        buyer_iban = smart_str(getattr(doc, "buyer_iban", "") or "")
        buyer_country = smart_str(getattr(doc, "buyer_country_iso", "") or "LT")

        _ensure_client(
            root,
            code=buyer_code,
            name=buyer_name,
            address=buyer_addr,
            iban=buyer_iban,
            country_iso=buyer_country,
        )

        pard = ET.SubElement(operacijos, "pardavimas")
        ET.SubElement(pard, "serija").text = series
        ET.SubElement(pard, "dokumentas").text = number

        k = ET.SubElement(pard, "klientas", {"kodo_tipas": "im_kodas"})
        k.text = buyer_code

        ET.SubElement(pard, "data").text = format_date(invoice_date)
        ET.SubElement(pard, "valiuta").text = currency.upper()
        ET.SubElement(pard, "mokejimo_data").text = format_date(payment_date)
        ET.SubElement(pard, "pastaba").text = smart_str(getattr(doc, "preview_url", "") or "")
        ET.SubElement(pard, "imp_param").text = "VA"

        det = ET.SubElement(pard, "operacijaDet")

        # multi/single источник pvm кодов по строкам
        line_map = getattr(doc, "_pvm_line_map", None)

        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, "all") and line_items.exists():
            for item in line_items.all():
                if line_map is not None:  # multi
                    code = (line_map or {}).get(getattr(item, "id", None))
                else:  # single
                    code = getattr(item, "pvm_kodas", None)

                _fill_line(
                    det,
                    is_purchase=False,
                    line_obj=item,
                    currency=currency,
                    pvm_kodas_value=code,
                )
        else:
            _fill_line(
                det,
                is_purchase=False,
                line_obj=None,
                currency=currency,
                fallback_amount_wo_vat=getattr(doc, "amount_wo_vat", None),
                fallback_vat_amount=getattr(doc, "vat_amount", None),
                fallback_name=smart_str(getattr(doc, "prekes_pavadinimas", "") or ""),
                pvm_kodas_value=getattr(doc, "pvm_kodas", None),
            )

    xml_bytes = _pretty_bytes(root)
    return expand_empty_tags(xml_bytes)




# # backend/docscanner_app/exports/finvalda.py
# import xml.etree.ElementTree as ET
# from xml.dom import minidom
# from django.utils.encoding import smart_str

# from .formatters import format_date, get_price_or_zero, expand_empty_tags
# # vat_to_int_str не нужен: pvm_proc берём из LineItem.vat_percent

# FNS = {"xsi": "http://www.w3.org/2001/XMLSchema-instance"}


# def _pretty_bytes(elem: ET.Element) -> bytes:
#     """
#     Возвращает красивый XML (bytes) с декларацией, без пустых строк.
#     """
#     rough = ET.tostring(elem, encoding="utf-8")
#     parsed = minidom.parseString(rough)
#     xml = parsed.toprettyxml(indent="  ", encoding="utf-8")
#     # убираем пустые строки
#     lines = [l for l in xml.decode("utf-8").split("\n") if l.strip()]
#     return "\n".join(lines).encode("utf-8")


# def _root() -> ET.Element:
#     """
#     Создаёт корневой <fvsdata> с обязательными секциями.
#     """
#     root = ET.Element("fvsdata", {"xmlns:xsi": FNS["xsi"]})
#     ET.SubElement(root, "klientai")
#     ET.SubElement(root, "prekes")      # пока пусто, но оставляем раздел
#     ET.SubElement(root, "operacijos")
#     return root


# def _select_client_code(*values) -> str:
#     """
#     Возвращает первый непустой из значений, иначе "neraimoneskodo".
#     """
#     for v in values:
#         sv = smart_str(v or "")
#         if sv.strip():
#             return sv
#     return "neraimoneskodo"


# def _ensure_client(
#     root: ET.Element,
#     *,
#     code: str,
#     name: str,
#     address: str = "",
#     iban: str = "",
#     country_iso: str = "LT",
# ):
#     """
#     Добавляет клиента в <klientai>, если его ещё нет (по коду).
#     Маппинг:
#       <kodas> = code
#       <pavadinimas> = name
#       <adresas> = address
#       <banko_sas> = iban
#       <im_kodas> = code
#       <salis_kodas> = country_iso
#     """
#     klientai = root.find("klientai")
#     assert klientai is not None

#     code = smart_str(code or "")
#     # проверка на дубликат по <kodas>
#     for k in klientai.findall("klientas"):
#         k_code = (k.findtext("kodas") or "").strip()
#         if k_code == code:
#             return  # уже есть

#     klientas = ET.SubElement(klientai, "klientas")
#     ET.SubElement(klientas, "kodas").text = code
#     ET.SubElement(klientas, "pavadinimas").text = smart_str(name or "")
#     ET.SubElement(klientas, "adresas").text = smart_str(address or "")
#     ET.SubElement(klientas, "banko_sas").text = smart_str(iban or "")
#     ET.SubElement(klientas, "im_kodas").text = code
#     ET.SubElement(klientas, "salis_kodas").text = smart_str(country_iso or "LT")


# def _fill_line(
#     parent: ET.Element,
#     *,
#     is_purchase: bool,
#     line_obj=None,
#     currency: str = "EUR",
#     fallback_amount_wo_vat=None,
#     fallback_vat_amount=None,
#     fallback_name: str = "",
# ):
#     """
#     Добавляет <eilute> в <operacijaDet> по правилам:

#     - <tipas> = "1" если preke_paslauga == "preke", иначе "2"
#     - <kodas> = prekes_kodas или prekes_barkodas, иначе "neraprekeskodo"
#     - <kiekis pirmas_mat="true"> = quantity (по умолчанию 1.00)
#     - <sandelis> = sandelio_kodas
#     - <pavadinimas> = prekes_pavadinimas
#     - суммы:
#         если EUR:
#             <suma_l> = subtotal, <suma_pvml> = vat, <suma_v>=0, <suma_pvmv>=0
#         иначе:
#             <suma_v> = subtotal, <suma_pvmv> = vat, <suma_l>=0, <suma_pvml>=0
#       (subtotal брать из lineItem; если строки нет — из fallback_amount_wo_vat)
#     - <pvm_proc> = vat_percent
#     - <pvm_kodas> = pvm_kodas
#     - <kodas> статьи (<kodas> в примере "SANAUDOS"/"PAJAMOS") мы НЕ ставим —
#       В Finvalda это поле <kodas> строки используется как код номенклатуры/статьи.
#       Твой маппинг требует код товара/штрих-код, его и используем.
#       Статью расходов/доходов при необходимости можно выставлять другим тегом/параметром импорта.
#     """
#     eilute = ET.SubElement(parent, "eilute")

#     # tipas
#     preke_paslauga = None
#     if line_obj is not None:
#         preke_paslauga = getattr(line_obj, "preke_paslauga", None)
#     tipas_val = "1" if (preke_paslauga and str(preke_paslauga).lower() == "preke") else "2"
#     ET.SubElement(eilute, "tipas").text = tipas_val

#     # kodas: prekes_kodas -> prekes_barkodas -> "neraprekeskodo"
#     prekes_kodas = getattr(line_obj, "prekes_kodas", None) if line_obj is not None else None
#     prekes_barkodas = getattr(line_obj, "prekes_barkodas", None) if line_obj is not None else None
#     kodas_val = prekes_kodas or prekes_barkodas or "neraprekeskodo"
#     ET.SubElement(eilute, "kodas").text = smart_str(kodas_val)

#     # kiekis
#     qty = None
#     if line_obj is not None:
#         qty = getattr(line_obj, "quantity", None)
#     if qty is None:
#         qty = 1
#     ET.SubElement(eilute, "kiekis", {"pirmas_mat": "true"}).text = f"{float(qty):.2f}"

#     # sandelis
#     sandelio_kodas = getattr(line_obj, "sandelio_kodas", None) if line_obj is not None else ""
#     ET.SubElement(eilute, "sandelis").text = smart_str(sandelio_kodas or "")

#     # pavadinimas
#     name = getattr(line_obj, "prekes_pavadinimas", None) if line_obj is not None else None
#     ET.SubElement(eilute, "pavadinimas").text = smart_str(name or fallback_name or "")

#     # суммы: берём из lineItem.subtotal / lineItem.vat, иначе из fallback
#     if line_obj is not None:
#         subtotal = getattr(line_obj, "subtotal", None)
#         vat_amount = getattr(line_obj, "vat", None)
#     else:
#         subtotal = fallback_amount_wo_vat
#         vat_amount = fallback_vat_amount

#     cur = (currency or "EUR").upper()
#     if cur == "EUR":
#         ET.SubElement(eilute, "suma_v").text = "0"
#         ET.SubElement(eilute, "suma_l").text = get_price_or_zero(subtotal)
#         ET.SubElement(eilute, "suma_pvmv").text = "0"
#         ET.SubElement(eilute, "suma_pvml").text = get_price_or_zero(vat_amount)
#     else:
#         ET.SubElement(eilute, "suma_v").text = get_price_or_zero(subtotal)
#         ET.SubElement(eilute, "suma_l").text = "0"
#         ET.SubElement(eilute, "suma_pvmv").text = get_price_or_zero(vat_amount)
#         ET.SubElement(eilute, "suma_pvml").text = "0"

#     # pvm_proc
#     vat_percent = None
#     if line_obj is not None:
#         vat_percent = getattr(line_obj, "vat_percent", None)
#     # приводим к числу/строке с двумя знаками, если есть
#     if vat_percent is None or vat_percent == "":
#         pvm_proc_text = "0.00"
#     else:
#         try:
#             pvm_proc_text = f"{float(vat_percent):.2f}"
#         except Exception:
#             pvm_proc_text = "0.00"
#     ET.SubElement(eilute, "pvm_proc").text = pvm_proc_text

#     # pvm_kodas
#     pvm_kodas = getattr(line_obj, "pvm_kodas", None) if line_obj is not None else ""
#     ET.SubElement(eilute, "pvm_kodas").text = smart_str(pvm_kodas or "")


# def export_pirkimai_group_to_finvalda(documents):
#     """
#     Экспорт ПРИОБРЕТЕНИЙ (pirkimas) в формат Finvalda.
#     Возвращает bytes (полный XML c <fvsdata>).

#     Маппинг важного:
#       - Клиент в <pirkimas> — это поставщик (seller)
#       - <data> = invoice_date
#       - <mokejimo_data> = operation_date, если нет — invoice_date
#       - <reg_data> = invoice_date
#       - <dokumento_data> = invoice_date
#       - <klientas kodo_tipas="im_kodas"> = тот же код, что и в <klientai>/<kodas>
#     """
#     root = _root()
#     operacijos = root.find("operacijos")
#     assert operacijos is not None

#     for doc in documents:
#         currency = getattr(doc, "currency", "EUR") or "EUR"
#         series = smart_str(getattr(doc, "document_series", "") or "")
#         number = smart_str(getattr(doc, "document_number", "") or "")

#         invoice_date = getattr(doc, "invoice_date", None)
#         op_date = getattr(doc, "operation_date", None)
#         payment_date = op_date or invoice_date

#         # Код контрагента: seller_id -> seller_vat_code -> "neraimoneskodo"
#         seller_code = _select_client_code(
#             getattr(doc, "seller_id", None),
#             getattr(doc, "seller_vat_code", None),
#         )
#         seller_name = smart_str(getattr(doc, "seller_name", "") or "")
#         seller_addr = smart_str(getattr(doc, "seller_address", "") or "")
#         seller_iban = smart_str(getattr(doc, "seller_iban", "") or "")
#         seller_country = smart_str(getattr(doc, "seller_country_iso", "") or "LT")

#         _ensure_client(
#             root,
#             code=seller_code,
#             name=seller_name or "No Supplier",
#             address=seller_addr or "",
#             iban=seller_iban or "",
#             country_iso=seller_country or "LT",
#         )

#         pirkimas = ET.SubElement(operacijos, "pirkimas")
#         ET.SubElement(pirkimas, "serija").text = series
#         ET.SubElement(pirkimas, "dokumentas").text = number
#         ET.SubElement(pirkimas, "data").text = format_date(invoice_date)
#         ET.SubElement(pirkimas, "valiuta").text = currency.upper()
#         ET.SubElement(pirkimas, "mokejimo_data").text = format_date(payment_date)
#         ET.SubElement(pirkimas, "reg_data").text = format_date(invoice_date)
#         ET.SubElement(pirkimas, "dokumento_data").text = format_date(invoice_date)

#         k = ET.SubElement(pirkimas, "klientas", {"kodo_tipas": "im_kodas"})
#         k.text = seller_code

#         ET.SubElement(pirkimas, "pastaba").text = smart_str(getattr(doc, "preview_url", "") or "")
#         ET.SubElement(pirkimas, "imp_param").text = "VA"

#         det = ET.SubElement(pirkimas, "operacijaDet")

#         # строки
#         line_items = getattr(doc, "line_items", None)
#         if line_items and hasattr(line_items, "all") and line_items.exists():
#             for item in line_items.all():
#                 _fill_line(
#                     det,
#                     is_purchase=True,
#                     line_obj=item,
#                     currency=currency,
#                 )
#         else:
#             # Фоллбек без line_items: используем поля документа
#             _fill_line(
#                 det,
#                 is_purchase=True,
#                 line_obj=None,
#                 currency=currency,
#                 fallback_amount_wo_vat=getattr(doc, "amount_wo_vat", None),
#                 fallback_vat_amount=getattr(doc, "vat_amount", None),
#                 fallback_name=smart_str(getattr(doc, "prekes_pavadinimas", "") or ""),
#             )

#     xml_bytes = _pretty_bytes(root)
#     return expand_empty_tags(xml_bytes)


# def export_pardavimai_group_to_finvalda(documents):
#     """
#     Экспорт ПРОДАЖ (pardavimas) в формат Finvalda.
#     Возвращает bytes (полный XML c <fvsdata>).

#     Маппинг важного:
#       - Клиент в <pardavimas> — это покупатель (buyer)
#       - <data> = invoice_date
#       - <mokejimo_data> = operation_date, если нет — invoice_date
#       - <klientas kodo_tipas="im_kodas"> = тот же код, что и в <klientai>/<kodas>
#     """
#     root = _root()
#     operacijos = root.find("operacijos")
#     assert operacijos is not None

#     for doc in documents:
#         currency = getattr(doc, "currency", "EUR") or "EUR"
#         series = smart_str(getattr(doc, "document_series", "") or "")
#         number = smart_str(getattr(doc, "document_number", "") or "")

#         invoice_date = getattr(doc, "invoice_date", None)
#         op_date = getattr(doc, "operation_date", None)
#         payment_date = op_date or invoice_date

#         # Код контрагента: buyer_id -> buyer_vat_code -> "neraimoneskodo"
#         buyer_code = _select_client_code(
#             getattr(doc, "buyer_id", None),
#             getattr(doc, "buyer_vat_code", None),
#         )
#         buyer_name = smart_str(getattr(doc, "buyer_name", "") or "No Buyer")
#         buyer_addr = smart_str(getattr(doc, "buyer_address", "") or "Lithuania")
#         buyer_iban = smart_str(getattr(doc, "buyer_iban", "") or "")
#         buyer_country = smart_str(getattr(doc, "buyer_country_iso", "") or "LT")

#         _ensure_client(
#             root,
#             code=buyer_code,
#             name=buyer_name,
#             address=buyer_addr,
#             iban=buyer_iban,
#             country_iso=buyer_country,
#         )

#         pard = ET.SubElement(operacijos, "pardavimas")
#         ET.SubElement(pard, "serija").text = series
#         ET.SubElement(pard, "dokumentas").text = number

#         k = ET.SubElement(pard, "klientas", {"kodo_tipas": "im_kodas"})
#         k.text = buyer_code

#         ET.SubElement(pard, "data").text = format_date(invoice_date)
#         ET.SubElement(pard, "valiuta").text = currency.upper()
#         ET.SubElement(pard, "mokejimo_data").text = format_date(payment_date)
#         ET.SubElement(pard, "pastaba").text = smart_str(getattr(doc, "preview_url", "") or "")
#         ET.SubElement(pard, "imp_param").text = "VA"

#         det = ET.SubElement(pard, "operacijaDet")

#         # строки
#         line_items = getattr(doc, "line_items", None)
#         if line_items and hasattr(line_items, "all") and line_items.exists():
#             for item in line_items.all():
#                 _fill_line(
#                     det,
#                     is_purchase=False,
#                     line_obj=item,
#                     currency=currency,
#                 )
#         else:
#             _fill_line(
#                 det,
#                 is_purchase=False,
#                 line_obj=None,
#                 currency=currency,
#                 fallback_amount_wo_vat=getattr(doc, "amount_wo_vat", None),
#                 fallback_vat_amount=getattr(doc, "vat_amount", None),
#                 fallback_name=smart_str(getattr(doc, "prekes_pavadinimas", "") or ""),
#             )

#     xml_bytes = _pretty_bytes(root)
#     return expand_empty_tags(xml_bytes)
