import os
from django.conf import settings
from django.shortcuts import render
from django.core.files.storage import FileSystemStorage

# Create your views here.

from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from .serializers import TopUserSerializer, UserDetailsSerializer, UserUpdateSerializer # Importa o serializer que converte o user para JSON - feito por mim


User = get_user_model() # usa se user model para ter user personalizado (se tiver). Não obriga a usar User base do Django, 


# Listar todos os utilizadores - serve para testes 
@api_view(['GET'])
@permission_classes([])
def list_users(request):
    users = User.objects.all()
    serializer = UserDetailsSerializer(users, many=True)
    return Response(serializer.data)

# Listar utilizador logado - serve para testes e para obter dados do utilizador 
@api_view(['GET']) # Define que este endpoint aceita apenas requests GET
@permission_classes([IsAuthenticated]) # Garante que apenas utilizadores autenticados podem aceder a este endpoint          
def get_logged_user(request):
    user = request.user 
    serializer = UserDetailsSerializer(user) # Passa dados do user para o serializer (json)
    return Response(serializer.data) # Retorna os dados do user em formato JSON

# Editar dados do utilizador autenticado - deve dar para editar tudo menos password e mail - TODO CRIAR FC PARA EMAIL/PASSWORD C/ VERIFICAÇÃO
@api_view(['PUT'])
@permission_classes([IsAuthenticated])          
def edit_logged_user(request):
    user = request.user
    data = request.data
    serializer = UserUpdateSerializer(user, data, partial = True) # partial = True permite atualizar apenas alguns campos do user
    
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=200)

    return Response(serializer.errors, status=400) # Retorna os dados do user em formato JSON

@api_view(["GET"])
@permission_classes([])  # público, tal como o teu list_users
def top_users(request):
    qs = User.objects.order_by("-points", "id")[:3]
    data = TopUserSerializer(qs, many=True).data
    return Response(data, status=200)

