# services.py
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
