from django.contrib import admin

from .models import Event, Invite, Participant

admin.site.register(Event)
admin.site.register(Invite)
admin.site.register(Participant)
