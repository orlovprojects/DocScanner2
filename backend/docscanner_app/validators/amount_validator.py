import logging
logger = logging.getLogger("docscanner_app.amounts")

def validate_and_calculate_main_amounts(data):
    """
    Проверяет и при необходимости вычисляет суммы для суммарного (sumiskai) документа.
    """

    def to_float(x):
        if x is None or x == "" or str(x).lower() == "null":
            return None
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    logger.info(f"[validate_main] ISKODNYE: {data}")

    amount_wo_vat = to_float(data.get("amount_wo_vat"))
    vat_amount = to_float(data.get("vat_amount"))
    vat_percent = to_float(data.get("vat_percent"))
    amount_with_vat = to_float(data.get("amount_with_vat"))

    logger.info(f"[validate_main] DO OBRABOTKI: amount_wo_vat={amount_wo_vat}, vat_amount={vat_amount}, vat_percent={vat_percent}, amount_with_vat={amount_with_vat}")

    calc_log = []

    # 1. amount_wo_vat
    if amount_wo_vat is None:
        if amount_with_vat is not None and vat_percent is not None:
            amount_wo_vat = round(amount_with_vat / (1 + vat_percent / 100), 2)
            calc_log.append("amount_wo_vat из amount_with_vat и vat_percent")
        elif amount_with_vat is not None and vat_amount is not None:
            amount_wo_vat = round(amount_with_vat - vat_amount, 2)
            calc_log.append("amount_wo_vat из amount_with_vat и vat_amount")

    # 2. vat_amount
    if vat_amount is None:
        if amount_wo_vat is not None and vat_percent is not None:
            vat_amount = round(amount_wo_vat * vat_percent / 100, 2)
            calc_log.append("vat_amount из amount_wo_vat и vat_percent")
        elif amount_with_vat is not None and amount_wo_vat is not None:
            vat_amount = round(amount_with_vat - amount_wo_vat, 2)
            calc_log.append("vat_amount из amount_with_vat и amount_wo_vat")

    # 3. vat_percent
    if vat_percent is None:
        if amount_wo_vat and vat_amount is not None and amount_wo_vat != 0:
            vat_percent = round(vat_amount / amount_wo_vat * 100, 2)
            calc_log.append("vat_percent из vat_amount и amount_wo_vat")
        elif amount_wo_vat and amount_with_vat and amount_wo_vat != 0:
            vat_percent = round((amount_with_vat / amount_wo_vat - 1) * 100, 2)
            calc_log.append("vat_percent из amount_with_vat и amount_wo_vat")

    # 4. amount_with_vat
    if amount_with_vat is None:
        if amount_wo_vat is not None and vat_percent is not None:
            amount_with_vat = round(amount_wo_vat * (1 + vat_percent / 100), 2)
            calc_log.append("amount_with_vat из amount_wo_vat и vat_percent")
        elif amount_wo_vat is not None and vat_amount is not None:
            amount_with_vat = round(amount_wo_vat + vat_amount, 2)
            calc_log.append("amount_with_vat из amount_wo_vat и vat_amount")

    logger.info(f"[validate_main] POSLE OBRABOTKI: amount_wo_vat={amount_wo_vat}, vat_amount={vat_amount}, vat_percent={vat_percent}, amount_with_vat={amount_with_vat}")
    logger.info(f"[validate_main] CALC_LOG: {calc_log}")

    # Вернуть обратно
    data["amount_wo_vat"] = None if amount_wo_vat is None else round(amount_wo_vat, 2)
    data["vat_amount"] = None if vat_amount is None else round(vat_amount, 2)
    data["vat_percent"] = None if vat_percent is None else round(vat_percent, 2)
    data["amount_with_vat"] = None if amount_with_vat is None else round(amount_with_vat, 2)
    data["_main_amounts_calc_log"] = calc_log

    return data



def validate_and_calculate_lineitem_amounts(item):
    def to_float(x):
        if x is None or x == "" or str(x).lower() == "null":
            return None
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    logger.info(f"[validate_line] ISKODNYE: {item}")

    calc_log = []

    quantity = to_float(item.get("quantity"))
    price = to_float(item.get("price"))
    subtotal = to_float(item.get("subtotal"))
    vat = to_float(item.get("vat"))
    vat_percent = to_float(item.get("vat_percent"))
    total = to_float(item.get("total"))

    # 1. subtotal
    if subtotal is None:
        if quantity is not None and price is not None:
            subtotal = round(quantity * price, 2)
            calc_log.append("subtotal из quantity и price")
        elif total is not None and vat_percent is not None:
            subtotal = round(total / (1 + vat_percent / 100), 2)
            calc_log.append("subtotal из total и vat_percent")
        elif total is not None and vat is not None:
            subtotal = round(total - vat, 2)
            calc_log.append("subtotal из total и vat")

    # 2. vat
    if vat is None:
        if subtotal is not None and vat_percent is not None:
            vat = round(subtotal * vat_percent / 100, 2)
            calc_log.append("vat из subtotal и vat_percent")
        elif total is not None and subtotal is not None:
            vat = round(total - subtotal, 2)
            calc_log.append("vat из total и subtotal")

    # 3. vat_percent
    if vat_percent is None:
        if vat is not None and subtotal and subtotal != 0:
            vat_percent = round(vat / subtotal * 100, 2)
            calc_log.append("vat_percent из vat и subtotal")
        elif total is not None and subtotal and subtotal != 0:
            vat_percent = round((total / subtotal - 1) * 100, 2)
            calc_log.append("vat_percent из total и subtotal")

    # 4. total
    if total is None:
        if subtotal is not None and vat_percent is not None:
            total = round(subtotal * (1 + vat_percent / 100), 2)
            calc_log.append("total из subtotal и vat_percent")
        elif subtotal is not None and vat is not None:
            total = round(subtotal + vat, 2)
            calc_log.append("total из subtotal и vat")

    # 5. price
    if price is None:
        if subtotal is not None and quantity and quantity != 0:
            price = round(subtotal / quantity, 4)
            calc_log.append("price из subtotal и quantity")
        elif total is not None and quantity and quantity != 0 and vat_percent is not None:
            price = round((total / (1 + vat_percent / 100)) / quantity, 4)
            calc_log.append("price из total, vat_percent, quantity")

    # 6. quantity
    if quantity is None:
        if subtotal is not None and price and price != 0:
            quantity = round(subtotal / price, 2)
            calc_log.append("quantity из subtotal и price")
        elif total is not None and price and price != 0 and vat_percent is not None:
            quantity = round((total / (1 + vat_percent / 100)) / price, 2)
            calc_log.append("quantity из total, vat_percent, price")

    # 7. quantity и price по умолчанию, если остались пустыми
    if quantity is None:
        quantity = 1
        calc_log.append("quantity по умолчанию 1")

    if price is None and subtotal is not None:
        price = subtotal
        calc_log.append("price по умолчанию = subtotal")
        

    logger.info(f"[validate_line] POSLE OBRABOTKI: quantity={quantity}, price={price}, subtotal={subtotal}, vat={vat}, vat_percent={vat_percent}, total={total}")
    logger.info(f"[validate_line] CALC_LOG: {calc_log}")

    # Собираем результат обратно (или None, если не удалось вычислить)
    item["quantity"] = None if quantity is None else round(quantity, 2)
    item["price"] = None if price is None else round(price, 4)
    item["subtotal"] = None if subtotal is None else round(subtotal, 2)
    item["vat"] = None if vat is None else round(vat, 2)
    item["vat_percent"] = None if vat_percent is None else round(vat_percent, 2)
    item["total"] = None if total is None else round(total, 2)
    item["_lineitem_calc_log"] = calc_log
    return item


def compare_lineitems_with_main_totals(doc_struct):
    """
    Проверяет, совпадают ли суммы по line_items с основными суммами документа.
    Возвращает dict с флагами совпадения и разницей по каждому полю.
    """
    def to_float(x):
        if x is None or x == "" or str(x).lower() == "null":
            return 0.0
        try:
            return float(x)
        except (TypeError, ValueError):
            return 0.0

    line_items = doc_struct.get("line_items", [])

    sum_wo_vat = sum(to_float(item.get("subtotal")) for item in line_items)
    sum_vat = sum(to_float(item.get("vat")) for item in line_items)
    sum_with_vat = sum(to_float(item.get("total")) for item in line_items)

    amount_wo_vat = to_float(doc_struct.get("amount_wo_vat"))
    vat_amount = to_float(doc_struct.get("vat_amount"))
    amount_with_vat = to_float(doc_struct.get("amount_with_vat"))

    logger.info(f"[compare_lineitems] SUM_LINE_ITEMS: subtotal={sum_wo_vat}, vat={sum_vat}, total={sum_with_vat}")
    logger.info(f"[compare_lineitems] MAIN_TOTALS: amount_wo_vat={amount_wo_vat}, vat_amount={vat_amount}, amount_with_vat={amount_with_vat}")

    result = {
        "subtotal_match": abs(sum_wo_vat - amount_wo_vat) < 0.01,
        "vat_match": abs(sum_vat - vat_amount) < 0.01,
        "total_match": abs(sum_with_vat - amount_with_vat) < 0.01,
        "subtotal_diff": round(sum_wo_vat - amount_wo_vat, 2),
        "vat_diff": round(sum_vat - vat_amount, 2),
        "total_diff": round(sum_with_vat - amount_with_vat, 2),
        "line_sum_wo_vat": round(sum_wo_vat, 2),
        "line_sum_vat": round(sum_vat, 2),
        "line_sum_with_vat": round(sum_with_vat, 2),
        "main_wo_vat": round(amount_wo_vat, 2),
        "main_vat": round(vat_amount, 2),
        "main_with_vat": round(amount_with_vat, 2),
    }

    logger.info(f"[compare_lineitems] RESULT: {result}")

    return result