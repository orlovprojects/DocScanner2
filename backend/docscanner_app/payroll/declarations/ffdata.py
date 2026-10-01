"""
Universalus FFData (ABBYY eFormFiller) generatorius Sodros ir VMI formoms.

Specifikacijos: payroll/declarations/specs/<sodra|vmi>/<FORMA>-v<NN>.json (sugeneruotos iš .mxfd).
Taisyklės: UTF-8, vienas pranešimas faile, VISI lapo laukai privalo būti (net tušti),
skaičiai su kableliu (1500,00), datos YYYY-MM-DD.
"""
import json
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

SPECS_DIR = Path(__file__).parent / "specs"


@lru_cache(maxsize=32)
def load_spec(authority, name):
    """load_spec("vmi", "GPM313-v1")"""
    with open(SPECS_DIR / authority / f"{name}.json", encoding="utf-8") as f:
        return json.load(f)


def num(value, places=2):
    """Decimal -> "1500,00" (be tūkstančių skirtukų)."""
    if value is None or value == "":
        return ""
    q = Decimal(1).scaleb(-places) if places else Decimal(1)
    return f"{Decimal(value).quantize(q, rounding=ROUND_HALF_UP)}".replace(".", ",")


def page_field_names(spec, page_name):
    """Visi lapo laukai tokia tvarka, kokia aprašyti specifikacijoje (eilutės išskleistos 1..rows_per_page)."""
    p = spec["pages"][page_name]
    names = [f["name"] for f in p.get("header_fields", [])]
    for n in range(1, (p.get("rows_per_page") or 0) + 1):
        names += [f["name"].replace("{N}", str(n)) for f in p.get("row_fields", [])]
    return names


def _group_name_for(groups, page_name):
    if page_name in (groups.get("pages") or []):
        return groups.get("name")
    for ch in groups.get("children") or []:
        found = _group_name_for(ch, page_name)
        if found:
            return found
    return None


def build_ffdata(spec, pages, *, app="DokSkenas", login="", created_on=None, document_pages=False):
    """
    pages: [(lapo_kodas, {laukas: reikšmė})] - lapai eilės tvarka.
    Reikšmės jau suformatuotos tekstu (naudok num() sumoms). Trūkstami laukai - tušti.
    document_pages: <DocumentPages> blokas. Tikruose priimtuose Sodros (ABBYY / EDAS) ir VMI failuose jo nėra,
    todėl pagal nutylėjimą neįtraukiamas.
    """
    created_on = created_on or date.today()
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           f'<FFData Version="1" CreatedByApp={quoteattr(app)} CreatedByLogin={quoteattr(login)} '
           f'CreatedOn="{created_on.isoformat()}" Id="FFData_Elem_0">',
           f'  <Form FormDefId="{spec["FormDefId"]}" FormLocation="">']

    if document_pages:
        root = spec["groups"]
        first = [p for p, _ in pages if p in (root.get("pages") or [])]
        rest = [p for p, _ in pages if p not in (root.get("pages") or [])]
        out.append("    <DocumentPages>")
        out.append(f'      <Group Name={quoteattr(root.get("name") or "Forma")}>')
        out.append("        <ListPages>" + "".join(f"<ListPage>{p}</ListPage>" for p in first) + "</ListPages>")
        for p in rest:
            g = _group_name_for(root, p) or "Tęsinys"
            out.append(f'        <Group Name={quoteattr(g)}><ListPages><ListPage>{p}</ListPage></ListPages></Group>')
        out.append("      </Group>")
        out.append("    </DocumentPages>")

    out.append(f'    <Pages Count="{len(pages)}">')
    for i, (page_name, values) in enumerate(pages, start=1):
        names = page_field_names(spec, page_name)
        unknown = set(values) - set(names)
        if unknown:
            raise ValueError(f"{page_name}: nežinomi laukai {sorted(unknown)}")
        out.append(f'      <Page PageDefName="{page_name}" PageNumber="{i}">')
        out.append(f'        <Fields Count="{len(names)}">')
        for n in names:
            v = values.get(n, "")
            v = "" if v is None else str(v)
            out.append(f'          <Field Name="{n}">{escape(v)}</Field>' if v else f'          <Field Name="{n}" />')
        out.append("        </Fields>")
        out.append("      </Page>")
    out.append("    </Pages>")
    out.append("  </Form>")
    out.append("</FFData>")
    return "\r\n".join(out).encode("utf-8")
