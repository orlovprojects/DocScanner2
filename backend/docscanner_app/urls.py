from django.urls import path, include
from .views import logout, CustomTokenObtainPairView, CustomRefreshTokenView, is_authenticated, register, subscription_status, process_image
from .stripe.subs_views   import StripeCreditCheckoutView
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
)
from . import views
from .views import TrackAdClickView

from rest_framework.routers import DefaultRouter
from .views import GuideCategoryViewSet, GuideArticleViewSet


router = DefaultRouter()
router.register(r"guides/categories", GuideCategoryViewSet, basename="guides-categories")
router.register(r"scanned-documents", ScannedDocumentViewSet, basename="scanned-document") 


urlpatterns = [

    path('scan/', process_image, name='process_image'),

    path('documents/', get_user_documents, name='get_user_documents'),
    path('documents/<int:pk>/', get_document_detail, name='get_document_detail'),
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
    path("settings/optimum/", OptimumSettingsView.as_view(), name="optimum-settings"),

    path("scanned-documents/<int:doc_id>/inline/", InlineDocUpdateView.as_view()),
    path("scanned-documents/<int:doc_id>/lineitem/<int:line_id>/inline/", InlineLineUpdateView.as_view()),

    path("api/contact/", contact_form, name="contact_form"),

    path("mobile/generate-key/", generate_mobile_key, name="generate_mobile_key"),
    path("mobile/send-invitation/", send_mobile_invitation, name="send_mobile_invitation"),
    path("mobile/upload/", mobile_upload_documents, name="mobile_upload_documents"),
    path("mobile/keys/", mobile_access_keys_list_create, name="mobile_access_keys"),
    path("mobile/keys/<int:pk>/", mobile_access_key_detail, name="mobile_access_key_detail"),
    path("web/mobile-inbox/", web_mobile_inbox, name="web-mobile-inbox-list"),
    path("web/mobile-inbox/promote/", web_mobile_inbox_promote, name="web-mobile-inbox-promote"),
    path("web/mobile-inbox/bulk-delete/", web_mobile_inbox_bulk_delete, name="web-mobile-inbox-bulk-delete"),

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




]