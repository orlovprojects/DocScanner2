from django.urls import path
from .views import logout, CustomTokenObtainPairView, CustomRefreshTokenView, is_authenticated, register, subscription_status, process_image
from .stripe.subs_views   import StripeCreditCheckoutView
from .stripe.webhooks    import StripeWebhookView
from .views import get_user_documents, get_document_detail, user_profile
from .views import (
    update_scanned_document_extra_fields,
    update_own_company_details,
    autocomplete_products,
    autocomplete_clients,
    update_lineitem_fields,
    import_clients_view,
    import_products_view,
    bulk_delete_documents,
    user_me_view,
)

from docscanner_app.views import export_documents
from .views import TrackAdClickView

urlpatterns = [

    path('scan/', process_image, name='process_image'),

    path('documents/', get_user_documents, name='get_user_documents'),
    path('documents/<int:pk>/', get_document_detail, name='get_document_detail'),
    path('documents/bulk-delete/', bulk_delete_documents, name='bulk_delete_documents'),

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
]