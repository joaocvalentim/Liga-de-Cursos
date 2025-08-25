from django.contrib.auth import get_user_model
from rest_framework import serializers
from dj_rest_auth.serializers import UserDetailsSerializer
from dj_rest_auth.registration.serializers import RegisterSerializer



User = get_user_model()  # Vai buscar o modelo User atual do projeto

class CustomUserDetailsSerializer(UserDetailsSerializer):
    hierarquia = serializers.CharField()
    tipo = serializers.CharField()
    curso = serializers.CharField()

    class Meta(UserDetailsSerializer.Meta):
        fields = UserDetailsSerializer.Meta.fields + ('hierarquia', 'curso', 'tipo')
        read_only_fields = ('email',)

class UserDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id','email', 'username', 'hierarquia', 'curso', 'tipo']
        
class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta: 
        model = User
        fields = ['username', 'hierarquia', 'curso', ]


        