from django.contrib import admin
from .models import BankStatement, IncomingTransaction, OutgoingTransaction, PaymentAllocation




class IncomingInline(admin.TabularInline):
    model = IncomingTransaction
    fields = ["transaction_date", "counterparty_name", "amount", "match_status", "match_confidence"]
    readonly_fields = fields
    extra = 0
    show_change_link = True


@admin.register(BankStatement)
class BankStatementAdmin(admin.ModelAdmin):
    list_display = [
        "id", "user", "bank_name", "period_from", "period_to",
        "total_entries", "auto_matched_count", "likely_matched_count",
        "unmatched_count", "status", "created_at",
    ]
    list_filter = ["bank_name", "status"]
    search_fields = ["user__email", "account_iban"]
    inlines = [IncomingInline]


class AllocationInline(admin.TabularInline):
    model = PaymentAllocation
    fields = ["invoice", "amount", "source", "status", "confidence", "payment_date"]
    extra = 0


@admin.register(IncomingTransaction)
class IncomingTransactionAdmin(admin.ModelAdmin):
    list_display = [
        "id", "transaction_date", "counterparty_name", "amount",
        "match_status", "match_confidence", "source",
    ]
    list_filter = ["match_status", "source"]
    search_fields = ["counterparty_name", "counterparty_code", "payment_purpose"]
    inlines = [AllocationInline]


@admin.register(OutgoingTransaction)
class OutgoingTransactionAdmin(admin.ModelAdmin):
    list_display = ["id", "transaction_date", "counterparty_name", "amount", "source"]
    list_filter = ["source"]
    search_fields = ["counterparty_name", "payment_purpose"]


@admin.register(PaymentAllocation)
class PaymentAllocationAdmin(admin.ModelAdmin):
    list_display = [
        "id", "invoice", "incoming_transaction", "amount",
        "source", "status", "confidence", "payment_date",
    ]
    list_filter = ["source", "status"]
    raw_id_fields = ["incoming_transaction", "invoice", "confirmed_by"]