from rest_framework.pagination import CursorPagination

class DocumentsCursorPagination(CursorPagination):
    page_size = 50
    ordering = ("-uploaded_at", "-id")


class UsersCursorPagination(CursorPagination):
    page_size = 50
    ordering = ("-date_joined", "-id")


class MobileInboxCursorPagination(CursorPagination):
    page_size = 50
    ordering = ("-created_at", "-id")