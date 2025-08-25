from django.db import models
from django.contrib.auth.models import AbstractUser
from django.db import models

# Create your models here.
class User(AbstractUser):

    HIERARQUIA = (
        ('Excelentissimo Pastrano', 'Excelentissimo Pastrano'),
        ('Excelentissimo Doutor', 'Excelentissimo Doutor'),
        ('Excelentissimo Veterano', 'Excelentissimo Veterano'),
    )
    TIPO = (
        ('admin', 'Admin'),
        ('normal', 'Normal'),
    )
    Curso = (
        ('soc', 'Sociologia'),
        ('ige', 'Informática e Gestão de Empresas'),
        ('por definir', 'por definir'),

    )
    hierarquia = models.CharField(max_length=50, choices=HIERARQUIA)
    tipo = models.CharField(max_length=50, choices=TIPO, default='normal')
    curso = models.CharField(max_length=50, choices=Curso,default='por definir')


    def __str__(self): 
        return self.email if self.email else self.username
