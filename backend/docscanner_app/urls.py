from django.urls import path, include
from .views import logout, CustomTokenObtainPairView, CustomRefreshTokenView, is_authenticated, register, subscription_status, process_image
from .stripe.subs_views   import StripeCreditCheckoutView, inv_subscribe_checkout, inv_payment_history
from .stripe.webhooks    import StripeWebhookView
from .views import (
    get_user_documents,
    get_document_detail,
    user_profile,
    update_scanned_document_extra_fields,
    update_own_company_details,
    autocomplete_products,
    autocomplete_clients,
    update_lineitem_fields,
    import_clients_view,
    import_products_view,
    bulk_delete_documents,
    user_me_view,
    clear_document_product,
    clear_lineitem_product,
    update_view_mode,
    download_apskaita5_adapter,
    superuser_dashboard_stats,
    admin_documents_with_errors,
    admin_all_documents,
    export_documents,
    InlineDocUpdateView,
    InlineLineUpdateView,
    ScannedDocumentViewSet,
    admin_users_simple,
    contact_form,
    DinetaSettingsView,
    OptimumSettingsView,
    generate_mobile_key,
    send_mobile_invitation,
    mobile_upload_documents,
    mobile_access_keys_list_create,
    mobile_access_key_detail,
    web_mobile_inbox,
    web_mobile_inbox_promote,
    web_mobile_inbox_bulk_delete,
    payments_list,
    payment_invoice,
    get_user_counterparties,
    get_document_lineitems,
    swap_buyer_seller,
    export_sessions_active,
    export_log_detail,
    mailgun_inbound,
    RivileGamaAPIKeyListCreateView,
    RivileGamaAPIKeyDetailView,
    RivileGamaAPIKeyVerifyView,
    extra_fields_list,
    extra_fields_detail,
    extra_fields_check_duplicate,
)
from .views import (
    counterparty_list_create,
    counterparty_detail,
    invoice_settings,
    invoice_list,
    invoice_create,
    invoice_detail,
    invoice_update,
    invoice_delete,
    invoice_line_items,
    invoice_issue,
    invoice_send,
    invoice_mark_paid,
    invoice_cancel,
    invoice_duplicate,
    invoice_create_pvm_sf,
    invoice_summary,
    invoice_public,
    invoice_public_pdf,
    invoice_search_companies,
    measurement_unit_list,
    measurement_unit_detail,
    invoice_series_list,
    invoice_series_detail,
    invoice_next_number,
    invoice_check_number,
    invoice_search_products,
    product_list_create,
    product_detail,
    invoice_pdf,
    RecurringInvoiceViewSet,
    counterparty_import_template,
    counterparty_import_xlsx,
    product_import_template,
    product_import_xlsx,
    StatementUploadView,
    StatementListView,
    StatementDetailView,
    StatementReMatchView,
    InvoicePaymentDetailsView,
    RemoveManualPaymentView,
    ConfirmAllocationView,
    BulkConfirmView,
    RejectAllocationView,
    ImportStatsView,
    generate_payment_link,
    available_payment_providers,
    payment_webhook,
    connect_payment_provider,
    disconnect_payment_provider,
    invoice_email_list,
    invoice_send_email_view,
    invoice_send_reminder_view,
    invoice_email_summary,
    reminder_settings_view,
    reminder_settings_reset_view,
    mailgun_invoice_tracking_webhook,
    inv_subscription_status,
    inv_start_trial,
    inv_cancel_subscription,
    admin_all_invoices,
    admin_all_recurring_invoices,
)
from . import cloud_views
from . import views
from .views import TrackAdClickView

from rest_framework.routers import DefaultRouter
from .views import GuideCategoryViewSet, GuideArticleViewSet
from .utils.password_reset import (
    password_reset_request,
    password_reset_verify,
    password_reset_confirm,
)


router = DefaultRouter()
router.register(r"guides/categories", GuideCategoryViewSet, basename="guides-categories")
router.register(r"scanned-documents", ScannedDocumentViewSet, basename="scanned-document") 
router.register(r"invoicing/recurring-invoices", RecurringInvoiceViewSet, basename="recurring-invoice")


urlpatterns = [

    path('scan/', process_image, name='process_image'),

    path('documents/', get_user_documents, name='get_user_documents'),
    path('documents/<int:pk>/', get_document_detail, name='get_document_detail'),
    path('documents/<int:pk>/lineitems/', get_document_lineitems, name='get_document_lineitems'),
    path('documents/bulk-delete/', bulk_delete_documents, name='bulk_delete_documents'),

    path('download/apskaita5-adapter/', download_apskaita5_adapter, name='download_apskaita5_adapter'),

    path('me/', user_me_view),
    path("api/track-click/", TrackAdClickView.as_view(), name="TrackAdClickView"),


    path('documents/export_xml/', export_documents, name='export_documents'),

    path('profile/', user_profile, name='user_profile'),

    path('profile/update-company/', update_own_company_details, name='update_company_details'),

    # Login funkcii 
    path('token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'), 
    path('token/refresh/', CustomRefreshTokenView.as_view(), name='token_refresh'),

    # Logout funkcija
    path('logout/', logout),

    # Proverka ili user logged-in
    path('authenticated/', is_authenticated),

    # Registracija usera
    path('register/', register),



    # Разовый чек-аут для покупки кредитов
    path(
        'stripe/credit-checkout/',
        StripeCreditCheckoutView,
        name='stripe-credit-checkout'
    ),

    # Webhook для обработки успешных оплат (добавление кредитов)
    path(
        'stripe/webhook/',
        StripeWebhookView,
        name='stripe-webhook'
    ),

    path('autocomplete/products/', autocomplete_products, name='autocomplete_products'),
    path('autocomplete/clients/', autocomplete_clients, name='autocomplete_clients'),


    path('data/import-products/', import_products_view, name='import_products_view'),
    path('data/import-clients/', import_clients_view, name='import_clients_view'),


    path('scanned-documents/<int:pk>/extra-fields/', update_scanned_document_extra_fields, name="update_scanned_document_extra_fields"),

    path("scanned-documents/<int:doc_id>/lineitem/<int:lineitem_id>/", update_lineitem_fields, name="update_lineitem_fields"),


    path("scanned-documents/<int:pk>/clear-product/", clear_document_product),
    path("scanned-documents/<int:pk>/lineitem/<int:lineitem_id>/clear-product/", clear_lineitem_product),

    path("view-mode/", update_view_mode, name="user-view-mode"),

    path("settings/dineta/", DinetaSettingsView.as_view(), name="dineta-settings"),
    path('settings/optimum/', views.OptimumSettingsView.as_view(), name='optimum_settings'),
    path('settings/rivile-gama-api/keys/', RivileGamaAPIKeyListCreateView.as_view()),
    path('settings/rivile-gama-api/keys/<int:pk>/', RivileGamaAPIKeyDetailView.as_view()),
    path('settings/rivile-gama-api/keys/<int:pk>/verify/', RivileGamaAPIKeyVerifyView.as_view()),

    path("scanned-documents/<int:doc_id>/inline/", InlineDocUpdateView.as_view()),
    path("scanned-documents/<int:doc_id>/lineitem/<int:line_id>/inline/", InlineLineUpdateView.as_view()),

    path('documents/<int:pk>/swap-buyer-seller/', swap_buyer_seller, name='swap_buyer_seller'),

    path("api/contact/", contact_form, name="contact_form"),

    path("mobile/generate-key/", generate_mobile_key, name="generate_mobile_key"),
    path("mobile/send-invitation/", send_mobile_invitation, name="send_mobile_invitation"),
    path("mobile/upload/", mobile_upload_documents, name="mobile_upload_documents"),
    path("mobile/keys/", mobile_access_keys_list_create, name="mobile_access_keys"),
    path("mobile/keys/<int:pk>/", mobile_access_key_detail, name="mobile_access_key_detail"),
    path("web/mobile-inbox/", web_mobile_inbox, name="web-mobile-inbox-list"),
    path("web/mobile-inbox/promote/", web_mobile_inbox_promote, name="web-mobile-inbox-promote"),
    path("web/mobile-inbox/bulk-delete/", web_mobile_inbox_bulk_delete, name="web-mobile-inbox-bulk-delete"),
    path('web/sessions/<str:session_id>/retry/', views.retry_blocked_session),
    path('web/sessions/<str:session_id>/cancel/', views.cancel_blocked_session),

    path('mailgun/inbound/', mailgun_inbound, name='mailgun_inbound'),

    path('payments/', payments_list, name='payments-list'),
    path('payments/<int:pk>/invoice/', payment_invoice, name='payments-invoice'),





    # Nachiat pokupku subscription cerez Stripe
    # path('stripe/create-checkout-session/', StripeCheckoutView, name='stripe_checkout'),

    # Posle Stripe events (paymenta, prodlenija subscriptionsa) obnovliajet danyje subscriptionsa v BD
    # path('stripe/webhook/', stripe_webhook, name='stripe-webhook'),

    # Posle Stripe events (paymenta, prodlenija subscriptionsa) obnovliajet danyje subscriptionsa v BD
    # path('stripe/cancel/', cancel_subscription, name='stripe-cancel'),

    # Poluchit user subscription infu s BD dlia my subscriptions page
    # path('subscription-info/', get_user_subscription_info, name='subscription-info'),


    # Proveriajet status subscriptionsa usera dlia content restictions
    path('subscription-status/', subscription_status, name='subscription_status'),

    path('password-reset/request/', password_reset_request),
    path('password-reset/verify/', password_reset_verify),
    path('password-reset/confirm/', password_reset_confirm),


    # Proveriajet israsymo status subscriptions
    path("inv/subscription/", inv_subscription_status, name="inv-subscription-status"),
    path("inv/start-trial/", inv_start_trial, name="inv-start-trial"),

    path("inv/subscribe-checkout/", inv_subscribe_checkout, name="inv-subscribe-checkout"),
    path("inv/payments/", inv_payment_history, name="inv-payment-history"),
    path("inv/cancel-subscription/", inv_cancel_subscription, name="inv-cancel-subscription"),

















    # # Nachiat pokupku subscription cerez Stripe
    # path('stripe/create-checkout-session/', StripeCheckoutView, name='stripe_checkout'),

    # # Posle Stripe events (paymenta, prodlenija subscriptionsa) obnovliajet danyje subscriptionsa v BD
    # path('stripe/webhook/', stripe_webhook, name='stripe-webhook'),

    # # Posle Stripe events (paymenta, prodlenija subscriptionsa) obnovliajet danyje subscriptionsa v BD
    # # path('stripe/cancel/', cancel_subscription, name='stripe-cancel'),

    # # Poluchit user subscription infu s BD dlia my subscriptions page
    # # path('subscription-info/', get_user_subscription_info, name='subscription-info'),


    # # Proveriajet status subscriptionsa usera dlia content restictions
    # path('subscription-status/', subscription_status, name='subscription_status'),


    #DLIA SUPERUSEROV!!!:

    path('admin/documents_with_errors/', admin_documents_with_errors, name='admin_documents_with_errors'),
    path('superuser/dashboard-stats/', superuser_dashboard_stats, name="superuser_dashboard_stats"),
    path('admin/visi-failai/', admin_all_documents, name='admin_all_documents'),
    path("admin/users/", admin_users_simple, name="admin_users_simple"),

    #ADMIN israsymas
    path("admin/visos-saskaitos/", admin_all_invoices, name="admin_all_invoices"),
    path("admin/visos-periodines/", admin_all_recurring_invoices, name="admin_all_recurring_invoices"),

    #Optimizacija skorosti

    path("documents/counterparties/", get_user_counterparties),

    path("", include(router.urls)),




    path("sessions/create/", views.create_session, name="session_create"),
    path("sessions/<uuid:session_id>/status/", views.session_status, name="session_status"),
    path("sessions/<uuid:session_id>/upload/", views.upload_batch, name="session_upload_batch"),
    path("sessions/<uuid:session_id>/finalize/", views.finalize_session, name="session_finalize"),
    
    # Chunked upload для архивов
    path("sessions/<uuid:session_id>/chunks/init/", views.chunk_init, name="chunk_init"),
    path("sessions/<uuid:session_id>/chunks/<uuid:upload_id>/<int:index>/", views.upload_chunk, name="upload_chunk"),
    path("sessions/<uuid:session_id>/chunks/<uuid:upload_id>/status/", views.chunk_status, name="chunk_status"),
    path("sessions/<uuid:session_id>/chunks/<uuid:upload_id>/complete/", views.chunk_complete, name="chunk_complete"),

    path("sessions/active/", views.active_sessions, name="sessions_active"),


    path('export-sessions/active/', views.export_sessions_active, name='export_sessions_active'),
    path('documents/<int:document_id>/export-log/', views.export_log_detail, name='export_log_detail'),


    # ─── Google Drive/Dropbox Integration ───
    path('cloud/google/auth/',      cloud_views.GoogleDriveAuthStartView.as_view()),
    path('cloud/google/callback/',  cloud_views.GoogleDriveAuthCallbackView.as_view()),
    path('cloud/dropbox/auth/',     cloud_views.DropboxAuthStartView.as_view()),
    path('cloud/dropbox/callback/', cloud_views.DropboxAuthCallbackView.as_view()),
    path('cloud/connections/',      cloud_views.CloudConnectionListView.as_view()),
    path('cloud/connections/<str:provider>/disconnect/', cloud_views.CloudConnectionDisconnectView.as_view()),
    path('cloud/clients/',                 cloud_views.CloudClientListCreateView.as_view()),
    path('cloud/clients/<int:client_id>/', cloud_views.CloudClientDetailView.as_view()),
    path('cloud/folders/share/',                cloud_views.ShareCloudFolderView.as_view()),
    path('cloud/folders/<int:folder_id>/sync/', cloud_views.ManualSyncView.as_view()),
    path('cloud/webhook/google/',  cloud_views.GoogleDriveWebhookView.as_view()),
    path('cloud/webhook/dropbox/', cloud_views.DropboxWebhookView.as_view()),
    path('cloud/inbox/',           cloud_views.UnifiedInboxView.as_view()),
    path('cloud/inbox/clients/', cloud_views.InboxClientsView.as_view()),


    path("extra-fields/<str:program_key>/", extra_fields_list, name="extra_fields_list"),
    path("extra-fields/<str:program_key>/check-duplicate/", extra_fields_check_duplicate, name="extra_fields_check_duplicate"),
    path("extra-fields/<str:program_key>/<str:company_code>/", extra_fields_detail, name="extra_fields_detail"),


    ### Invoice emails (email-summary ПЕРВЫМ!)
    path("invoicing/invoices/email-summary/", invoice_email_summary),
    path("invoicing/invoices/<int:invoice_id>/emails/", invoice_email_list),
    path("invoicing/invoices/<int:invoice_id>/send-email/", invoice_send_email_view),
    path("invoicing/invoices/<int:invoice_id>/send-reminder/", invoice_send_reminder_view),
    path("invoicing/reminder-settings/", reminder_settings_view),
    path("invoicing/reminder-settings/reset/", reminder_settings_reset_view),
    path("webhooks/mailgun/invoice-tracking/", mailgun_invoice_tracking_webhook),

    # ─── Invoicing (sąskaitų išrašymas) ───
    path('invoicing/counterparties/', counterparty_list_create, name='counterparty-list'),
    path('invoicing/counterparties/<int:pk>/', counterparty_detail, name='counterparty-detail'),
    path('invoicing/settings/', invoice_settings, name='invoice-settings'),
    path('invoicing/invoices/', invoice_list, name='invoice-list'),
    path('invoicing/invoices/create/', invoice_create, name='invoice-create'),
    path('invoicing/invoices/summary/', invoice_summary, name='invoice-summary'),
    path('invoicing/invoices/<int:pk>/', invoice_detail, name='invoice-detail'),
    path('invoicing/invoices/<int:pk>/update/', invoice_update, name='invoice-update'),
    path('invoicing/invoices/<int:pk>/delete/', invoice_delete, name='invoice-delete'),
    path('invoicing/invoices/<int:pk>/line-items/', invoice_line_items, name='invoice-line-items'),
    path('invoicing/invoices/<int:pk>/issue/', invoice_issue, name='invoice-issue'),
    path('invoicing/invoices/<int:pk>/send/', invoice_send, name='invoice-send'),
    path('invoicing/invoices/<int:pk>/mark-paid/', invoice_mark_paid, name='invoice-mark-paid'),
    path('invoicing/invoices/<int:pk>/cancel/', invoice_cancel, name='invoice-cancel'),
    path('invoicing/invoices/<int:pk>/duplicate/', invoice_duplicate, name='invoice-duplicate'),
    path('invoicing/invoices/<int:pk>/create-pvm-sf/', invoice_create_pvm_sf, name='invoice-create-pvm-sf'),
    path('invoicing/public/<uuid:uuid>/', invoice_public, name='invoice-public'),
    path('invoicing/public/<uuid:uuid>/pdf/', invoice_public_pdf, name='invoice-public-pdf'),
    path('invoicing/search-companies/', invoice_search_companies, name='invoice-search-companies'),
    path('invoicing/invoices/<int:pk>/pdf/', invoice_pdf, name='invoice-pdf'),


    path('invoicing/units/', measurement_unit_list, name='measurement-unit-list'),
    path('invoicing/units/<int:pk>/', measurement_unit_detail, name='measurement-unit-detail'),
    path('invoicing/series/', invoice_series_list, name='invoice-series-list'),
    path('invoicing/series/<int:pk>/', invoice_series_detail, name='invoice-series-detail'),


    path('invoicing/next-number/', invoice_next_number, name='invoice-next-number'),
    path('invoicing/check-number/', invoice_check_number, name='invoice-check-number'),
    path('invoicing/search-products/', invoice_search_products, name='invoice-search-products'),

    path('invoicing/products/', product_list_create, name='product-list'),
    path('invoicing/products/<int:pk>/', product_detail, name='product-detail'),

    path('invoicing/counterparties/import-template/', counterparty_import_template, name='counterparty-import-template'),
    path('invoicing/counterparties/import/', counterparty_import_xlsx, name='counterparty-import'),
    path('invoicing/products/import-template/', product_import_template, name='product-import-template'),
    path('invoicing/products/import/', product_import_xlsx, name='product-import'),

    # Recurring invoices (ViewSet)
    *router.urls,

    # ─── Bank import & Payments ───
    path('invoicing/bank-statements/upload/', StatementUploadView.as_view(), name='bank-statement-upload'),
    path('invoicing/bank-statements/', StatementListView.as_view(), name='bank-statement-list'),
    path('invoicing/bank-statements/<int:pk>/', StatementDetailView.as_view(), name='bank-statement-detail'),
    path('invoicing/bank-statements/<int:pk>/re-match/', StatementReMatchView.as_view(), name='bank-statement-rematch'),

    path('invoicing/invoices/<int:pk>/payments/', InvoicePaymentDetailsView.as_view(), name='invoice-payments'),
    path('invoicing/invoices/<int:pk>/remove-payment/<int:alloc_id>/', RemoveManualPaymentView.as_view(), name='remove-payment'),

    path('invoicing/payments/confirm/', ConfirmAllocationView.as_view(), name='payment-confirm'),
    path('invoicing/payments/bulk-confirm/', BulkConfirmView.as_view(), name='payment-bulk-confirm'),
    path('invoicing/payments/reject/', RejectAllocationView.as_view(), name='payment-reject'),

    path('invoicing/payments/stats/', ImportStatsView.as_view(), name='payment-stats'),

    # ─── Direct payment links ───
    # Payment providers
    path("invoices/<int:invoice_id>/generate-payment-link/", generate_payment_link, name="generate_payment_link"),
    path("invoicing/payment-providers/", available_payment_providers, name="available_payment_providers"),
 
    # NEW — single connect (save + test) endpoint
    path("invoicing/payment-providers/connect/", connect_payment_provider, name="connect_payment_provider"),
 
    # NEW — disconnect
    path("invoicing/payment-providers/disconnect/", disconnect_payment_provider, name="disconnect_payment_provider"),
 
    # Webhook (public)
    path("invoicing/payment-webhook/<str:provider_name>/<int:invoice_id>/", payment_webhook, name="payment_webhook"),

]