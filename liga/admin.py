from django.contrib import admin
from .models import Curso, Competition, CompetitionEntry, Match, MatchVote

# Register your models here.
@admin.register(Curso)
class CursoAdmin(admin.ModelAdmin):
    list_display = ("name", "short_code")
    search_fields = ("name", "short_code")

@admin.register(Competition)
class CompetitionAdmin(admin.ModelAdmin):
    list_display = ("title", "season_label", "status", "start_date", "end_date")
    list_filter = ("status", "season_label")
    search_fields = ("title", "season_label")

@admin.register(CompetitionEntry)
class CompetitionEntryAdmin(admin.ModelAdmin):
    list_display = ("competition", "curso", "pote", "points", "wins", "draws", "losses")
    list_filter = ("competition", "pote")
    search_fields = ("competition__season_label", "curso__name", "curso__short_code")

@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ("competition", "stage", "curso1", "curso2", "scheduled_at", "status", "winner_entry")
    list_filter = ("competition", "stage", "status")
    search_fields = ("curso1__curso__name", "curso2__curso__name")
    autocomplete_fields = ("curso1", "curso2", "winner_entry")

@admin.register(MatchVote)
class MatchVoteAdmin(admin.ModelAdmin):
    list_display = ("match", "user", "pick_entry", "created_at")
    list_filter = ("match__competition",)
    search_fields = ("user__username", "pick_entry__curso__name")
