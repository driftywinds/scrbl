from django.db import migrations

# Legacy Chinese display names that used to be written by the comment API.
LEGACY_ANONYMOUS = "\u533f\u540d"  # anonymous
LEGACY_GUEST_PREFIX = "\u8bbf\u5ba2-"  # guest-

ANONYMOUS = "Anonymous"
GUEST_PREFIX = "Guest-"


def english_comment_names(apps, schema_editor):
    """Rewrite existing Chinese comment author names to their English form."""
    Comment = apps.get_model("tapnote", "Comment")

    # Anonymous comments
    Comment.objects.filter(user_name=LEGACY_ANONYMOUS).update(user_name=ANONYMOUS)

    # Guest comments: legacy "guest-" prefix (in Chinese) -> "Guest-"
    legacy_prefix_length = len(LEGACY_GUEST_PREFIX)
    for comment in Comment.objects.filter(user_name__startswith=LEGACY_GUEST_PREFIX):
        comment.user_name = GUEST_PREFIX + comment.user_name[legacy_prefix_length:]
        comment.save(update_fields=["user_name"])


def noop_reverse(apps, schema_editor):
    """One-way data cleanup; nothing to undo."""


class Migration(migrations.Migration):

    dependencies = [
        ("tapnote", "0008_telegraphaccount_note_views_note_account"),
    ]

    operations = [
        migrations.RunPython(english_comment_names, noop_reverse),
    ]
