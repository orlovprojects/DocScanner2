from rest_framework.pagination import CursorPagination
from rest_framework.pagination import LimitOffsetPagination

class DocumentsCursorPagination(CursorPagination):
    page_size = 50
    ordering = ("-uploaded_at", "-id")


class UsersCursorPagination(CursorPagination):
    page_size = 50
    ordering = ("-date_joined", "-id")


class MobileInboxCursorPagination(CursorPagination):
    page_size = 50
    ordering = ("-created_at", "-id")


class LineItemPagination(LimitOffsetPagination):
    default_limit = 30
    max_limit = 200