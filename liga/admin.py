from django import forms
from django.contrib.admin.helpers import ActionForm
from django.contrib import admin, messages
from .models import Curso, Competition, CompetitionEntry, Match, MatchVote, MatchStatus, SimpleVote, SimpleVoteQuestion
from .services import aplicar_resultado, gerar_quartos_de_final, recalcular_classificacao

# Register your models here.

# -----------------------
# Admin: Criar competicoes/cursos/inserir nas competições/criar confrontos
# -----------------------

@admin.register(Curso)
class CursoAdmin(admin.ModelAdmin):
    list_display = ("name", "short_code")
    search_fields = ("name", "short_code")
    ordering = ("name",)    

    
@admin.register(Competition)
class CompetitionAdmin(admin.ModelAdmin):
    list_display = ("title", "season_label", "status", "start_date", "end_date")
    actions = ["action_criar_qf"]
    list_filter = ("status", "season_label")
    search_fields = ("title", "season_label")
    ordering = ("-start_date", "title")

    @admin.action(description="Criar Quartos de Final (1-8, 2-7, 3-6, 4-5)")
    def action_criar_qf(self, request, queryset):
        total = 0
        for comp in queryset:
            total += gerar_quartos_de_final(comp)
        if total:
            messages.success(request, f"Criados {total} confrontos de Quartos de Final.")
        else:
            messages.warning(request, "Sem confrontos criados (já existiam QF ou não há 8 equipas).")
    
    

# admin.py
@admin.register(CompetitionEntry)
class CompetitionEntryAdmin(admin.ModelAdmin):
    list_display = ("competition", "curso", "pote", "points", "wins", "draws", "losses", "manual_rank")
    list_editable = ("manual_rank",)
    list_filter = ("competition", "pote")
    search_fields = ("competition__season_label", "curso__name", "curso__short_code")
    ordering = ("competition", "manual_rank", "-points", "-pote", "curso__name")

# -----------------------
# Admin: confrontos - criar/acabar
# -----------------------
class FecharConfrontoForm(ActionForm):
    outcome = forms.ChoiceField(
        choices=[
            ("draw", "Empate (1 ponto para cada)"),
            ("c1", "Vitória Curso 1 (3 pontos)"),
            ("c2", "Vitória Curso 2 (3 pontos)"),
        ],
        required=True,
        label="Resultado",
        help_text="Escolhe o desfecho para os confrontos selecionados.",
    )
    


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ("competition", "stage", "curso1", "curso2", "scheduled_at", "status", "winner_entry")
    list_filter = ("competition", "stage", "status")
    search_fields = ("curso1__curso__name", "curso2__curso__name")
    autocomplete_fields = ("curso1", "curso2", "winner_entry")
    list_select_related = ("competition", "curso1", "curso2", "winner_entry")
    ordering = ("competition", "scheduled_at")

    # Action única
    action_form = FecharConfrontoForm
    actions = ["fechar_confronto"]
    @admin.action(description="Fechar confronto (escolher resultado)")
    def fechar_confronto(self, request, queryset):
        outcome = request.POST.get("outcome")
        if outcome not in {"draw", "c1", "c2"}:
            self.message_user(request, "Tens de escolher um resultado na caixa de seleção.", level=messages.ERROR)
            return

        fechados = 0
        for m in queryset.select_related("curso1", "curso2"):
            # ignora jogos já finalizados (se quiseres forçar re-fecho, remove esta verificação)
            if m.status == MatchStatus.FT:
                continue

            vencedor = None
            if outcome == "c1":
                vencedor = m.curso1
            elif outcome == "c2":
                vencedor = m.curso2
            # draw => vencedor = None

            aplicar_resultado(m, vencedor)   # marca FT e, se GROUP, recalcula classificação
            fechados += 1

        if fechados:
            self.message_user(request, f"{fechados} confronto(s) fechado(s).", level=messages.SUCCESS)
        else:
            self.message_user(request, "Nenhum confronto foi fechado (já estavam como 'Final'?).", level=messages.WARNING)





# -----------------------
# Admin: auxiliar
# -----------------------

@admin.action(description="Recalcular classificação (fase de grupos)")
def action_recalcular_classificacao(modeladmin, request, queryset):
    count = 0
    for comp in queryset:
        recalcular_classificacao(comp)
        count += 1
    messages.success(request, f"Classificação recalculada para {count} competição(ões).")

@admin.register(MatchVote)
class MatchVoteAdmin(admin.ModelAdmin):
    list_display = ("match", "user", "pick_entry", "created_at")
    list_filter = ("match__competition",)
    search_fields = ("user__username", "pick_entry__curso__name")
    readonly_fields = ("match", "user", "pick_entry", "created_at", "updated_at")

    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    
    
    
@admin.register(SimpleVoteQuestion)
class SimpleVoteQuestionAdmin(admin.ModelAdmin):
    list_display = ("text", "competition", "total_votes_display", "leader_display")
    list_filter = ("competition",)
    search_fields = ("text", "competition__season_label")

    def total_votes_display(self, obj):
        return obj.total_votes()
    total_votes_display.short_description = "Total votos"

    def leader_display(self, obj):
        res = obj.leader()
        if not res:
            return "—"
        entry, pct = res
        return f"{entry.curso} — {pct*100:.1f}%"
    leader_display.short_description = "Líder (prob.)"
    
@admin.register(SimpleVote)
class SimpleVoteAdmin(admin.ModelAdmin):
    list_display = ("question", "user", "pick_entry")
    list_filter = ("question__competition", "question")
    search_fields = ("user__username", "pick_entry__curso__name")
    readonly_fields = ("question", "user", "pick_entry")

    def has_add_permission(self, request):  # votos vêm do site, não criar no admin
        return False

    def has_change_permission(self, request, obj=None):
        return False