from ..validators.company_name_normalizer import normalize_company_name

def determine_pirkimas_pardavimas(doc_struct, user):
    company_code = (user.company_code or '').strip()
    vat_code = (user.vat_code or '').strip()
    company_name = normalize_company_name(user.company_name or '')

    seller_id = (doc_struct.get('seller_id') or '').strip()
    seller_vat_code = (doc_struct.get('seller_vat_code') or '').strip()
    seller_name = normalize_company_name(doc_struct.get('seller_name') or '')
    buyer_id = (doc_struct.get('buyer_id') or '').strip()
    buyer_vat_code = (doc_struct.get('buyer_vat_code') or '').strip()
    buyer_name = normalize_company_name(doc_struct.get('buyer_name') or '')

    # Сначала seller
    if company_code and seller_id and company_code == seller_id:
        return "pardavimas"
    if vat_code and seller_vat_code and vat_code == seller_vat_code:
        return "pardavimas"
    if company_name and seller_name and company_name == seller_name:
        return "pardavimas"
    # Теперь buyer
    if company_code and buyer_id and company_code == buyer_id:
        return "pirkimas"
    if vat_code and buyer_vat_code and vat_code == buyer_vat_code:
        return "pirkimas"
    if company_name and buyer_name and company_name == buyer_name:
        return "pirkimas"
    return "nezinoma"