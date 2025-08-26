from rest_framework import serializers
from .models import CompetitionEntry, Match

# Curso compacto para mostrar nome/código
class CursoSlimSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="curso.id")
    name = serializers.CharField(source="curso.name")
    short_code = serializers.CharField(source="curso.short_code")

# Linha da classificação da fase de grupos
class StandingEntrySerializer(serializers.ModelSerializer):
    course = CursoSlimSerializer(source="*", read_only=True)  # pega curso via entry.curso
    class Meta:
        model = CompetitionEntry
        fields = ["id", "pote", "points", "wins", "draws", "losses", "course"]

# Confronto (lista/detalhe) com info dos dois cursos
class MatchSerializer(serializers.ModelSerializer):
    entry1 = CursoSlimSerializer(source="curso1", read_only=True)
    entry2 = CursoSlimSerializer(source="curso2", read_only=True)
    entry1_id = serializers.IntegerField(source="curso1_id", read_only=True)
    entry2_id = serializers.IntegerField(source="curso2_id", read_only=True)

    winner_entry = serializers.IntegerField(source="winner_entry_id", read_only=True, allow_null=True)

    class Meta:
        model = Match
        fields = [
            "id", "competition", "stage", "status", "scheduled_at",
            "entry1", "entry2", "entry1_id", "entry2_id","winner_entry"
        ]
        
class MatchVoteInputSerializer(serializers.Serializer):
    pick_entry_id = serializers.IntegerField()
    
# Perguntas simples (votações gerais)
class SimpleVoteQuestionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    competition = serializers.IntegerField()
    text = serializers.CharField()
    is_active = serializers.BooleanField()
    opens_at = serializers.DateTimeField(allow_null=True)
    closes_at = serializers.DateTimeField(allow_null=True)

# Body para votar numa pergunta
class SimpleVoteInputSerializer(serializers.Serializer):
    pick_entry_id = serializers.IntegerField()
