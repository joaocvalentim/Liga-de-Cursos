# users/urls.py

from django.urls import path
from .views import get_logged_user, list_users, edit_logged_user, top_users

urlpatterns = [
    path('user/', get_logged_user, name='get-logged-user'),
    path('users/', list_users, name='list-users'),
    path('user/edit/', edit_logged_user, name='edit-logged-user'),
    path('top/', top_users, name='top-users'),  # <-- NOVO

]
