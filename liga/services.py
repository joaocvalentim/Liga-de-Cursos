# services.py
from django.utils import timezone
from django.db import transaction
from django.db.models import F
from .models import Competition, Match, MatchStatus, MatchStage, CompetitionEntry

@transaction.atomic
def recalcular_classificacao(competition: Competition) -> None:
    CompetitionEntry.objects.filter(competition=competition).update(
        points=0, wins=0, draws=0, losses=0
    )
    matches = (Match.objects
        .filter(competition=competition, stage=MatchStage.GROUP, status=MatchStatus.FT)
        .select_related("curso1","curso2","winner_entry"))

    for m in matches:
        if m.winner_entry_id is None:
            CompetitionEntry.objects.filter(pk__in=[m.curso1_id, m.curso2_id]) \
                .update(points=F("points")+1, draws=F("draws")+1)
        else:
            CompetitionEntry.objects.filter(pk=m.winner_entry_id) \
                .update(points=F("points")+3, wins=F("wins")+1)
            loser_id = m.curso2_id if m.winner_entry_id == m.curso1_id else m.curso1_id
            CompetitionEntry.objects.filter(pk=loser_id) \
                .update(losses=F("losses")+1)

@transaction.atomic
def aplicar_resultado(match: Match, vencedor: CompetitionEntry | None) -> None:
    match.status = MatchStatus.FT
    match.winner_entry = vencedor  # None = empate
    match.save(update_fields=["status","winner_entry"])
    if match.stage == MatchStage.GROUP:
        recalcular_classificacao(match.competition)
        
@transaction.atomic
def gerar_quartos_de_final(comp: Competition, when=None):
    """
    Cria 4 jogos QF: 1º-8º, 2º-7º, 3º-6º, 4º-5º.
    Respeita manual_rank quando existir; senão usa pontos/pote/nome.
    Ignora se já existirem jogos QF nessa competição.
    """
    if Match.objects.filter(competition=comp, stage=MatchStage.QF).exists():
        return 0  # já existem

    order = ["-points", "-pote", "curso__name"]
    # se tiveres manual_rank, mete-o primeiro:
    if hasattr(CompetitionEntry, "manual_rank"):
        order = [F("manual_rank").asc(nulls_last=True)] + order

    entries = list(
        CompetitionEntry.objects
        .filter(competition=comp)
        .select_related("curso")
        .order_by(*order)[:8]
    )
    if len(entries) < 8:
        return 0

    pairs = [(0,7), (1,6), (2,5), (3,4)]
    when = when or timezone.now()
    created = 0
    for a, b in pairs:
        Match.objects.create(
            competition=comp,
            stage=MatchStage.QF,
            curso1=entries[a],
            curso2=entries[b],
            scheduled_at=when,
            status=MatchStatus.SCHEDULED,
        )
        created += 1
    return created
