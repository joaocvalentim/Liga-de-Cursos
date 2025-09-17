# services.py
from django.forms import ValidationError
from django.utils import timezone
from decimal import Decimal, ROUND_HALF_UP  
from decimal import Decimal, ROUND_DOWN
from django.db import transaction
from django.db.models import F
from django.db.models import Sum, F
from django.contrib.auth import get_user_model
from .models import Competition, Match, MatchStatus, MatchStage, CompetitionEntry, MatchVote

User = get_user_model()

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


SEED = 10  # tuning simples para evitar odds infinitas

def _match_pools(match: Match) -> dict[int, int]:
    """
    Devolve {entry_id: total_stake} para o jogo.
    """
    rows = (
        MatchVote.objects
        .filter(match=match)
        .values("pick_entry")
        .annotate(total=Sum("stake"))
    )
    return {row["pick_entry"]: int(row["total"] or 0) for row in rows}

def compute_match_odds(match: Match, seed: int = SEED) -> dict[int, Decimal]:
    """
    Odds decimais por entry_id, derivadas dos 'pools' de stake.
    """
    pools = _match_pools(match)
    a_id, b_id = match.curso1_id, match.curso2_id
    a = pools.get(a_id, 0)
    b = pools.get(b_id, 0)
    total = a + b
    # (total+2*seed)/(side+seed)
    def q(num, den):
        return Decimal(num).scaleb(0) / Decimal(den)  # Decimal preciso
    odd_a = q(total + 2*seed, a + seed).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    odd_b = q(total + 2*seed, b + seed).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {a_id: odd_a, b_id: odd_b}

@transaction.atomic
def place_match_bet(*, user, match_id: int, pick_entry_id: int, stake: int) -> MatchVote:
    if stake <= 0:
        raise ValidationError("Stake tem de ser > 0.")

    match = Match.objects.select_for_update().select_related(
        "curso1", "curso2"
    ).get(pk=match_id)

    # valida pick
    if pick_entry_id not in (match.curso1_id, match.curso2_id):
        raise ValidationError("Pick tem de ser um dos cursos do confronto.")

    # saldo suficiente
    User = get_user_model()
    u = User.objects.select_for_update().get(pk=user.pk)
    if u.points < stake:
        raise ValidationError("Saldo insuficiente.")

    # calcula a odd do lado escolhido neste instante
    odds = compute_match_odds(match)
    odd = odds[pick_entry_id]

    # debita pontos
    u.points = F("points") - stake
    u.save(update_fields=["points"])

    # cria aposta
    bet = MatchVote.objects.create(
        match=match,
        user=u,
        pick_entry_id=pick_entry_id,
        stake=stake,
        odds_at_bet=odd,
        settled=False,
        payout=0,
    )
    # garantir que devolvemos o saldo já atualizado
    u.refresh_from_db(fields=["points"])
    bet.user = u
    return bet

def _to_int_points(x: Decimal) -> int:
    # arredonda por defeito para inteiro (pontos são inteiros)
    return int(x.to_integral_value(rounding=ROUND_DOWN))


@transaction.atomic
def settle_match_bets(match):
    """
    Liquida todas as MatchVote de um confronto:
      - Vitória: quem acertou recebe stake * odds_at_bet (arredonda para inteiro).
      - Empate (winner_entry is None): devolução do stake.
      - Perdedor: payout = 0.
    Só liquida apostas ainda não settled, para não pagar duas vezes.
    """
    win_id = match.winner_entry_id

    stats = {"bets": 0, "awarded": 0, "refunded": 0, "lost": 0}

    with transaction.atomic():
        votes = (
            MatchVote.objects
            .select_related("user")
            .filter(match=match, settled=False)
            .order_by("id")
        )

        for v in votes:
            stats["bets"] += 1

            if win_id is None:
                # Empate -> devolução
                v.payout = v.stake
                v.user.points += v.stake
                stats["refunded"] += v.stake
            elif v.pick_entry_id == win_id:
                # Acertou -> paga stake * odd
                payout = int(Decimal(v.stake) * Decimal(v.odds_at_bet))
                v.payout = max(payout, 0)
                v.user.points += v.payout
                stats["awarded"] += v.payout
            else:
                # Errou -> perde stake
                v.payout = 0
                stats["lost"] += v.stake

            v.settled = True
            v.user.save(update_fields=["points"])
            v.save(update_fields=["settled", "payout"])

    return stats