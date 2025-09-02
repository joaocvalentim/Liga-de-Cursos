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
    CURSO = (
        ('ant', 'Antropologia'),
        ('arq', 'Arquitetura'),
        ('lcd', 'Ciência de Dados'),
        ('cpo', 'Ciências Politicas'),
        ('eco', 'Economia'),
        ('eti', 'Engenharia de Telecomunicações e Informática'),
        ('lei', 'Engenharia Informática'),
        ('fin', 'Finanças e Contabilidade'),
        ('ges', 'Gestão'),
        ('grh', 'Gestão de Recursos Humanos'),
        ('gil', 'Gestão Industrial e Logística'),
        ('gmk', 'Gestão de Marketing'),
        ('hmc', 'História Moderna e Contemporânea'),
        ('ige', 'Informática e Gestão de Empresas'),
        ('psi', 'Psicologia'),
        ('soc', 'Sociologia'),
        ('ss', 'Serviço Social'),
        ('sintra', 'Sintra'),               
        ('por definir', 'por definir'),
    )
    

    hierarquia = models.CharField(max_length=50, choices=HIERARQUIA)
    tipo = models.CharField(max_length=50, choices=TIPO, default='normal')
    curso = models.CharField(max_length=50, choices=CURSO)


    def __str__(self): 
        return self.email if self.email else self.username
