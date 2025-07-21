from ..models import CustomUser
from .company_name_normalizer import normalize_company_name

from ..models import CustomUser
from .company_name_normalizer import normalize_company_name

def update_seller_buyer_info(scanned_doc):
    users = CustomUser.objects.all()

    # === BUYER ===
    buyer_match = next(
        (
            user for user in users
            if (
                (scanned_doc.buyer_id and user.company_code and scanned_doc.buyer_id.strip() == user.company_code.strip())
                or (scanned_doc.buyer_vat_code and user.vat_code and scanned_doc.buyer_vat_code.strip() == user.vat_code.strip())
                or (scanned_doc.buyer_name and user.company_name and normalize_company_name(scanned_doc.buyer_name) == normalize_company_name(user.company_name))
            )
        ),
        None
    )

    if buyer_match:
        scanned_doc.buyer_id = buyer_match.company_code
        scanned_doc.buyer_name = buyer_match.company_name
        scanned_doc.buyer_vat_code = buyer_match.vat_code

    # === SELLER ===
    seller_match = next(
        (
            user for user in users
            if (
                (scanned_doc.seller_id and user.company_code and scanned_doc.seller_id.strip() == user.company_code.strip())
                or (scanned_doc.seller_vat_code and user.vat_code and scanned_doc.seller_vat_code.strip() == user.vat_code.strip())
                or (scanned_doc.seller_name and user.company_name and normalize_company_name(scanned_doc.seller_name) == normalize_company_name(user.company_name))
            )
        ),
        None
    )

    if seller_match:
        scanned_doc.seller_id = seller_match.company_code
        scanned_doc.seller_name = seller_match.company_name
        scanned_doc.seller_vat_code = seller_match.vat_code

    return scanned_doc