from django.contrib import admin
from .models import User

# Register your models here.
@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("username", "hierarquia", "curso")
    search_fields = ("username", "hierarquia", "curso")
    list_filter = ("hierarquia", "curso")
    ordering = ("username",)    