import uuid
import string
import secrets
from django.db import models
from django.utils import timezone

class Note(models.Model):
    hashcode = models.CharField(max_length=32, unique=True)
    title = models.CharField(max_length=200, blank=True, null=True)
    author = models.CharField(max_length=100, blank=True, null=True)
    content = models.TextField()
    link_target = models.CharField(max_length=10, default="_self", choices=[('_blank', 'New Tab'), ('_self', 'Same Tab')])
    edit_token = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    views = models.IntegerField(default=0)
    account = models.ForeignKey('TelegraphAccount', on_delete=models.SET_NULL, null=True, blank=True, related_name='pages')

    def __str__(self):
        return f"Note {self.hashcode}"

    def save(self, *args, **kwargs):
        if not self.hashcode:
            # Try to generate a unique 8-char short ID
            for _ in range(10):
                code = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))
                if not Note.objects.filter(hashcode=code).exists():
                    self.hashcode = code
                    break
            else:
                # Fallback to uuid hex if 10 tries fail (extremely unlikely)
                self.hashcode = uuid.uuid4().hex
                
        if not self.edit_token:
            self.edit_token = uuid.uuid4().hex
        super().save(*args, **kwargs)

class TelegraphAccount(models.Model):
    short_name = models.CharField(max_length=32)
    author_name = models.CharField(max_length=128, default='Anonymous')
    author_url = models.URLField(blank=True, default='')
    access_token = models.CharField(max_length=64, unique=True)
    
    def __str__(self):
        return f"{self.short_name} ({self.author_name})"

    def save(self, *args, **kwargs):
        if not self.access_token:
            self.access_token = secrets.token_hex(32)
        super().save(*args, **kwargs)

class Comment(models.Model):
    site_id = models.CharField(max_length=100)
    work_id = models.CharField(max_length=100)
    chapter_id = models.CharField(max_length=100)
    para_index = models.IntegerField()
    content = models.TextField()
    user_name = models.CharField(max_length=100, default="Anonymous")
    user_id = models.CharField(max_length=100, null=True, blank=True)
    user_avatar = models.CharField(max_length=255, null=True, blank=True)
    context_text = models.TextField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    likes = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.user_name}: {self.content[:20]}"

class LikeRecord(models.Model):
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name='like_records')
    user_id = models.CharField(max_length=100, null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['comment', 'user_id'], ['comment', 'ip']]

class BannedUser(models.Model):
    site_id = models.CharField(max_length=100)
    user_id = models.CharField(max_length=100)
    reason = models.TextField(blank=True, null=True)
    banned_by = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['site_id', 'user_id']]