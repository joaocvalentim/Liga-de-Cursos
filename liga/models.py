from django.db import models
from django.forms import ValidationError
from django.utils import timezone
from django.conf import settings


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        abstract = True


class Curso(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    short_code = models.CharField(max_length=20, unique=True)

    def __str__(self):
        return self.short_code or self.name


class CompetitionStatus(models.TextChoices):
    DRAFT = "draft", "Rascunho"
    LIVE = "live", "A decorrer"
    FINISHED = "finished", "Terminada"


class Competition(TimeStampedModel):
    title = models.CharField(max_length=100, default="Liga de Cursos")
    season_label = models.CharField(max_length=20, default="2025")  # ex.: "2025"
    status = models.CharField(max_length=10, choices=CompetitionStatus.choices, default=CompetitionStatus.DRAFT)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    class Meta:
        unique_together = ("title", "season_label")
        ordering = ["-start_date", "title"]

    def __str__(self):
        return f"{self.title} {self.season_label}".strip()


class CompetitionEntry(TimeStampedModel):
    class Pote(models.IntegerChoices):
        P1 = 1, "Pote 1"
        P2 = 2, "Pote 2"
        P3 = 3, "Pote 3"

    competition = models.ForeignKey(Competition, on_delete=models.CASCADE, related_name="entries")
    curso = models.ForeignKey(Curso, on_delete=models.CASCADE, related_name="entries")
    pote = models.PositiveSmallIntegerField(choices=Pote.choices)

    points = models.IntegerField(default=0)
    wins = models.PositiveSmallIntegerField(default=0)
    draws = models.PositiveSmallIntegerField(default=0)
    losses = models.PositiveSmallIntegerField(default=0)
    
    manual_rank = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Se preenchido, força a posição (1=1º).")

    
    class Meta:
        unique_together = ("competition", "curso")
        indexes = [models.Index(fields=["competition", "pote"])]

    def __str__(self):
        return f"{self.curso} @ {self.competition} (Pote {self.pote})"


class MatchStage(models.TextChoices):
    GROUP = "GROUP", "Fase de Grupos"
    QF = "QF", "Quartos"
    SF = "SF", "Meias"
    THIRD = "THIRD", "3º lugar"
    FINAL = "FINAL", "Final"
    TB = "TB", "Desempate"


class MatchStatus(models.TextChoices):
    SCHEDULED = "SCHEDULED", "Agendado"
    LIVE = "LIVE", "A decorrer"
    FT = "FT", "Final"


class Match(TimeStampedModel):
    competition = models.ForeignKey(Competition, on_delete=models.CASCADE, related_name="matches")
    stage = models.CharField(max_length=10, choices=MatchStage.choices, default=MatchStage.GROUP)

    curso1 = models.ForeignKey(CompetitionEntry, on_delete=models.CASCADE, related_name="curso1_matches")
    curso2 = models.ForeignKey(CompetitionEntry, on_delete=models.CASCADE, related_name="curso2_matches")

    scheduled_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=10, choices=MatchStatus.choices, default=MatchStatus.SCHEDULED)


    winner_entry = models.ForeignKey(
        CompetitionEntry, null=True, blank=True, on_delete=models.SET_NULL, related_name="won_matches"
    )

    class Meta:
        ordering = ["scheduled_at"]
        constraints = [
            models.CheckConstraint(check=~models.Q(curso1=models.F("curso2")), name="match_distinct_entries"),
            models.CheckConstraint(
                name="winner_is_participant",
                check=(
                    models.Q(winner_entry__isnull=True)
                    | models.Q(winner_entry=models.F("curso1"))
                    | models.Q(winner_entry=models.F("curso2"))
                ),
            ),
        ]
        indexes = [
            models.Index(fields=["competition", "stage", "status"]),
        ]

    def __str__(self):
        return f"{self.curso1.curso} vs {self.curso2.curso} ({self.stage})"

    def clean(self):
        # validação de coerência de competição
        if self.curso1 and self.curso2:
            if self.curso1_id == self.curso2_id:
                raise models.ValidationError("curso 1 e curso 2 não podem ser o mesmo.")
            if (self.curso1.competition_id and self.competition_id and
                self.curso1.competition_id != self.competition_id):
                raise models.ValidationError("curso 1 tem de pertencer à mesma competition.")
            if (self.curso2.competition_id and self.competition_id and
                self.curso2.competition_id != self.competition_id):
                raise models.ValidationError("curso 2 tem de pertencer à mesma competition.")


class MatchVote(TimeStampedModel):
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name="votes")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="match_votes")
    pick_entry = models.ForeignKey(CompetitionEntry, on_delete=models.CASCADE, related_name="picked_in_votes")

    class Meta:
        unique_together = ("user", "match")

    def __str__(self):
        return f"{self.user} → {self.pick_entry.curso} @ {self.match}"

    def clean(self):
        # o voto tem de escolher um dos dois participantes do jogo
        if self.match_id and self.pick_entry_id:
            if self.pick_entry_id not in (self.match.curso1_id, self.match.curso2_id):
                raise models.ValidationError("Pick tem de ser uma dos cursos do confronto.")



class SimpleVoteQuestion(models.Model):
    competition = models.ForeignKey(
        Competition, on_delete=models.CASCADE, related_name="simple_questions"
    )
    text = models.CharField(max_length=200)           # a pergunta

    def __str__(self):
        return self.text

    # --- helpers para odds/percentagens (on-the-fly) ---
    def total_votes(self) -> int:
        return self.votes.count()

    def counts_by_entry(self):
        # devolve {entry_id: contagem}
        from django.db.models import Count
        rows = (
            self.votes.values("pick_entry")
            .annotate(n=Count("id"))
        )
        return {row["pick_entry"]: row["n"] for row in rows}

    def leader(self):
        """(entry, percent) do mais votado; None se não houver votos."""
        counts = self.counts_by_entry()
        if not counts:
            return None
        total = sum(counts.values())
        top_id, top_n = max(counts.items(), key=lambda kv: kv[1])
        # carregamos o objeto Entry só quando necessário
        entry = CompetitionEntry.objects.select_related("curso").get(pk=top_id)
        return entry, (top_n / total) if total else 0.0


# Voto simples: user escolhe um CompetitionEntry para a pergunta
class SimpleVote(models.Model):
    question = models.ForeignKey(
        SimpleVoteQuestion, on_delete=models.CASCADE, related_name="votes"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="simple_votes"
    )
    pick_entry = models.ForeignKey(
        CompetitionEntry, on_delete=models.CASCADE, related_name="picked_in_simple_votes"
    )

    class Meta:
        unique_together = ("question", "user")  # um voto por pergunta

    def __str__(self):
        return f"{self.user} → {self.pick_entry.curso} [{self.question.text}]"

    def clean(self):
        # garantir que o entry escolhido pertence à MESMA competição da pergunta
        if self.question_id and self.pick_entry_id:
            if self.pick_entry.competition_id != self.question.competition_id:
                raise ValidationError("O curso escolhido não pertence a esta competição.")