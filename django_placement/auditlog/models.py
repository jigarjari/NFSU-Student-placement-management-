import hashlib
from django.db import models
from django.utils import timezone


class AuditLog(models.Model):
    actor_username = models.CharField(max_length=150)
    actor_role = models.CharField(max_length=50)
    action = models.CharField(max_length=100)
    target_model = models.CharField(max_length=100, blank=True)
    target_id = models.CharField(max_length=100, blank=True)
    timestamp = models.DateTimeField(default=timezone.now)
    ip_address = models.CharField(max_length=45, default='127.0.0.1')
    outcome = models.CharField(max_length=20, default='SUCCESS')
    details = models.TextField(blank=True)
    
    # Cryptographic SHA-256 Hash Chaining
    prev_hash = models.CharField(max_length=64, default='GENESIS_HASH_NFSU_2026')
    current_hash = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ['-id']
        verbose_name = 'Audit Log'
        verbose_name_plural = 'Audit Logs'

    def __str__(self):
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] {self.actor_username} - {self.action} ({self.outcome})"

    def compute_hash(self):
        content = f"{self.prev_hash}|{self.timestamp.isoformat()}|{self.actor_username}|{self.actor_role}|{self.action}|{self.target_model}|{self.target_id}|{self.ip_address}|{self.outcome}|{self.details}"
        return hashlib.sha256(content.encode('utf-8')).hexdigest()

    def save(self, *args, **kwargs):
        if not self.current_hash:
            # Anchor to previous entry hash
            last_entry = AuditLog.objects.order_by('-id').first()
            if last_entry and last_entry.current_hash:
                self.prev_hash = last_entry.current_hash
            else:
                self.prev_hash = 'GENESIS_HASH_NFSU_2026'
            self.current_hash = self.compute_hash()
        super().save(*args, **kwargs)
