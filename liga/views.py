from django.shortcuts import render
from django.db.models import Count, Q
from django.utils.dateparse import parse_datetime
from django.utils.timezone import make_aware

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from datetime import datetime, timezone
from django.db.models import F

from .models import Competition, CompetitionEntry, Match, MatchStage, MatchStatus, MatchVote, SimpleVote, SimpleVoteQuestion
from .serializers import MatchVoteSerializer, SimpleVoteInputSerializer, SimpleVoteSerializer, StandingEntrySerializer, MatchSerializer, MatchVoteInputSerializer


# -------------------------
# Fase de grupos - classificação
# -------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def standings_view(request, competition_id: int):
    try:
        comp = Competition.objects.get(pk=competition_id)
    except Competition.DoesNotExist:
        return Response({"detail": "Competition not found."}, status=status.HTTP_404_NOT_FOUND)

    # views.py -> standings_view
    qs = (
    CompetitionEntry.objects
    .filter(competition=comp)
    .select_related("curso")
    .order_by(
        F("manual_rank").asc(nulls_last=True),   # manual primeiro (nulls no fim)
        "-points",
        "-pote",
        "curso__name",
    )
)

    
    data = StandingEntrySerializer(qs, many=True).data
    return Response({"competition": comp.id, "entries": data})


# -------------------------
# Lista de confrontos (filtros simples)
# -------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def matches_list_view(request, competition_id: int):
    try:
        comp = Competition.objects.get(pk=competition_id)
    except Competition.DoesNotExist:
        return Response({"detail": "Competition not found."}, status=status.HTTP_404_NOT_FOUND)

    qs = (
        Match.objects
        .filter(competition=comp)
        .select_related("curso1__curso", "curso2__curso", "winner_entry")
    )

    # filtros opcionais
    stage = request.query_params.get("stage")
    if stage:
        qs = qs.filter(stage=stage)

    status_param = request.query_params.get("status")
    if status_param:
        qs = qs.filter(status=status_param)

    date_from = request.query_params.get("date_from")  # ISO 8601
    if date_from:
        dt = parse_datetime(date_from) or datetime.fromisoformat(date_from)
        qs = qs.filter(scheduled_at__gte=make_aware(dt))

    date_to = request.query_params.get("date_to")      # ISO 8601
    if date_to:
        dt = parse_datetime(date_to) or datetime.fromisoformat(date_to)
        qs = qs.filter(scheduled_at__lte=make_aware(dt))

    ordering = request.query_params.get("ordering", "scheduled_at")  # ou "-scheduled_at"
    qs = qs.order_by(ordering)

    # limite opcional (para homepage: próximos 4, por ex.)
    try:
        limit = int(request.query_params.get("limit")) if request.query_params.get("limit") else None
    except ValueError:
        limit = None
    if limit:
        qs = qs[:limit]

    data = MatchSerializer(qs, many=True).data
    return Response({"competition": comp.id, "matches": data})


# -------------------------
# Detalhe de um confronto
# -------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def match_detail_view(request, match_id: int):
    try:
        m = (
            Match.objects
            .select_related("curso1__curso", "curso2__curso", "winner_entry")
            .get(pk=match_id)
        )
    except Match.DoesNotExist:
        return Response({"detail": "Match not found."}, status=status.HTTP_404_NOT_FOUND)

    data = MatchSerializer(m).data
    return Response(data)

# Throttle leve para evitar spam
class VoteRateThrottle(UserRateThrottle):
    rate = "10/min" # isto serve para limitar o número de votos que um utilizador pode submeter por minuto  

@api_view(["GET"])
@permission_classes([AllowAny])
def match_votes_summary_view(request, match_id: int):
    # match + cursos
    try:
        m = Match.objects.select_related("curso1__curso", "curso2__curso").get(pk=match_id)
    except Match.DoesNotExist:
        return Response({"detail": "Match not found."}, status=status.HTTP_404_NOT_FOUND)

    agg = MatchVote.objects.filter(match=m).aggregate(
        v1=Count("id", filter=Q(pick_entry_id=m.curso1_id)),
        v2=Count("id", filter=Q(pick_entry_id=m.curso2_id)),
    )
    v1, v2 = agg["v1"] or 0, agg["v2"] or 0
    total = v1 + v2
    # smoothing simples para percentagens estáveis
    prob1 = 1 / ((v1 + 1.0) / (total + 2.0))
    prob2 = 1 / ((v2 + 1.0) / (total + 2.0))    

    payload = {
        "match": m.id,
        "total": total,
        "entry1": {
            "entry_id": m.curso1_id,
            "course": {"id": m.curso1.curso.id, "name": m.curso1.curso.name, "short_code": m.curso1.curso.short_code},
            "count": v1,
            "prob": prob1,
        },
        "entry2": {
            "entry_id": m.curso2_id,
            "course": {"id": m.curso2.curso.id, "name": m.curso2.curso.name, "short_code": m.curso2.curso.short_code},
            "count": v2,
            "prob": prob2,
        },
    }
    return Response(payload)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([VoteRateThrottle])
def match_vote_view(request, match_id: int):
    # valida entrada
    ser = MatchVoteInputSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    pick_entry_id = ser.validated_data["pick_entry_id"]

    # carrega match e valida regras
    try:
        m = Match.objects.only("id", "status", "curso1_id", "curso2_id").get(pk=match_id)
    except Match.DoesNotExist:
        return Response({"detail": "Match not found."}, status=status.HTTP_404_NOT_FOUND)

    if m.status == "FT":
        return Response({"detail": "Este confronto já terminou."}, status=status.HTTP_400_BAD_REQUEST)

    if pick_entry_id not in (m.curso1_id, m.curso2_id):
        return Response({"detail": "Escolha tem de ser um dos dois cursos do confronto."}, status=status.HTTP_400_BAD_REQUEST)

    # cria ou atualiza o voto do utilizador (um por jogo)
    mv, created = MatchVote.objects.get_or_create(
        match_id=m.id, user=request.user,
        defaults={"pick_entry_id": pick_entry_id}
    )
    if not created and mv.pick_entry_id != pick_entry_id:
        mv.pick_entry_id = pick_entry_id
        mv.save(update_fields=["pick_entry"])

    return Response({"ok": True, "created": created, "pick_entry_id": pick_entry_id}, status=status.HTTP_200_OK)

# throttling leve para POST de votos
class QuestionVoteRateThrottle(UserRateThrottle):
    rate = "10/min"

# -------------------------
# LISTAR PERGUNTAS DE UMA COMPETIÇÃO
# -------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def questions_list_view(request, competition_id: int):
    try:
        comp = Competition.objects.get(pk=competition_id)
    except Competition.DoesNotExist:
        return Response({"detail": "Competition not found."}, status=status.HTTP_404_NOT_FOUND)

    qs = SimpleVoteQuestion.objects.filter(competition=comp).order_by("-id")

    data = [
        {
            "id": q.id,
            "competition": q.competition_id,
            "text": q.text,
        }
        for q in qs
    ]
    return Response({"competition": comp.id, "questions": data})

# -------------------------
# RESULTADOS DE UMA PERGUNTA (contagens + percentagens)
# -------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def question_results_view(request, question_id: int):
    try:
        q = SimpleVoteQuestion.objects.select_related("competition").get(pk=question_id)
    except SimpleVoteQuestion.DoesNotExist:
        return Response({"detail": "Question not found."}, status=status.HTTP_404_NOT_FOUND)

    # contagens por entry
    rows = (
        SimpleVote.objects
        .filter(question=q)
        .values("pick_entry")
        .annotate(count=Count("id"))
    )
    counts = {r["pick_entry"]: r["count"] for r in rows}
    total = sum(counts.values())

    # queremos devolver curso + percentagem; buscamos só os entries envolvidos
    entry_ids = list(counts.keys())
    entries = (
        CompetitionEntry.objects
        .filter(id__in=entry_ids)
        .select_related("curso")
    )

    K = max(len(entry_ids), 1)  # para smoothing
    results = []
    for e in entries:
        v = counts.get(e.id, 0)
        prob = (v + 1.0) / ((total or 0) + K)  # Laplace smoothing
        results.append({
            "entry_id": e.id,
            "course": {"id": e.curso.id, "name": e.curso.name, "short_code": e.curso.short_code},
            "count": v,
            "prob": prob,
        })

    payload = {
        "question": q.id,
        "competition": q.competition_id,
        "total": total,
        "results": results,
    }
    return Response(payload)


# -------------------------
# VOTAR NUMA PERGUNTA
# -------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([QuestionVoteRateThrottle])
def question_vote_view(request, question_id: int):
    ser = SimpleVoteInputSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    pick_entry_id = ser.validated_data["pick_entry_id"]

    try:
        q = SimpleVoteQuestion.objects.select_related("competition").get(pk=question_id)
    except SimpleVoteQuestion.DoesNotExist:
        return Response({"detail": "Question not found."}, status=status.HTTP_404_NOT_FOUND)

    # valida que o entry pertence à mesma competição
    try:
        entry = CompetitionEntry.objects.only("id", "competition_id").get(pk=pick_entry_id)
    except CompetitionEntry.DoesNotExist:
        return Response({"detail": "Entrada inválida."}, status=status.HTTP_400_BAD_REQUEST)

    if entry.competition_id != q.competition_id:
        return Response({"detail": "Curso não pertence a esta competição."}, status=status.HTTP_400_BAD_REQUEST)

    sv, created = SimpleVote.objects.get_or_create(
        question_id=q.id, user_id=request.user.id,
        defaults={"pick_entry_id": entry.id}
    )
    if not created and sv.pick_entry_id != entry.id:
        sv.pick_entry_id = entry.id
        sv.save(update_fields=["pick_entry"])

    return Response({"ok": True, "created": created, "pick_entry_id": entry.id}, status=status.HTTP_200_OK)

# -------------------------
# view para o quadro de jogos das eliminatórias
# -------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def bracket_view(request, competition_id: int):
    try:
        comp = Competition.objects.get(pk=competition_id)
    except Competition.DoesNotExist:
        return Response({"detail": "Competition not found."}, status=status.HTTP_404_NOT_FOUND)

    STAGES = ["QF", "SF", "THIRD", "FINAL"]

    qs = (
        Match.objects
        .filter(competition=comp, stage__in=STAGES)
        .select_related("curso1__curso", "curso2__curso", "winner_entry")
        .order_by("scheduled_at", "id")
    )

    # agrupar por fase
    bracket = {stage: [] for stage in STAGES}
    for m in qs:
        bracket[m.stage].append(m)

    # serializar por fase
    payload = {
        "competition": comp.id,
        "bracket": {
            stage: MatchSerializer(bracket[stage], many=True).data
            for stage in STAGES
        }
    }
    return Response(payload)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_bets_view(request):
    """
    Devolve todas as apostas do utilizador autenticado.
    Filtro opcional por competição: ?competition=<id>
    """
    competition_id = request.query_params.get("competition")

    match_votes = (
        MatchVote.objects
        .filter(user=request.user)
        .select_related(
            "match__curso1__curso",
            "match__curso2__curso",
            "pick_entry__curso",
        )
    )
    simple_votes = (
        SimpleVote.objects
        .filter(user=request.user)
        .select_related("question", "pick_entry__curso")
    )

    if competition_id:
        match_votes = match_votes.filter(match__competition_id=competition_id)
        simple_votes = simple_votes.filter(question__competition_id=competition_id)

    return Response({
        "match_votes": MatchVoteSerializer(match_votes, many=True).data,
        "question_votes": SimpleVoteSerializer(simple_votes, many=True).data,
    })