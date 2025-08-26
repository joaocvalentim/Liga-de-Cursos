# liga/urls.py
from django.urls import path
from .views import bracket_view, question_results_view, question_vote_view, questions_list_view, standings_view, matches_list_view, match_detail_view, match_votes_summary_view, match_vote_view


urlpatterns = [
    # Fase de grupos - classificação
    path("competitions/<int:competition_id>/standings/", standings_view, name="standings"),

    # Confrontos (lista e detalhe)
    path("competitions/<int:competition_id>/matches/", matches_list_view, name="matches-list"),
    path("matches/<int:match_id>/", match_detail_view, name="match-detail"),

    # Votação num confronto 
    path("matches/<int:match_id>/votes/summary/", match_votes_summary_view, name="match-votes-summary"),
    path("matches/<int:match_id>/vote/", match_vote_view, name="match-vote"),

    #votação simples
    path("competitions/<int:competition_id>/questions/", questions_list_view, name="questions-list"),
    path("questions/<int:question_id>/results/", question_results_view, name="question-results"),
    path("questions/<int:question_id>/vote/", question_vote_view, name="question-vote"),

    #eliminatórias
    path("competitions/<int:competition_id>/bracket/", bracket_view, name="bracket"),
]
