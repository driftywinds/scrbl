from django.db import migrations, models

OLD_DEFAULT = "newsreader"
NEW_DEFAULT = "ibm-plex"


def switch_old_default(apps, schema_editor):
    """Move notes still sitting on the previous default to the new one.

    Notes created before this change never had an explicit choice, so they are
    still on Newsreader only because it used to be the default.
    """
    Note = apps.get_model("tapnote", "Note")
    Note.objects.filter(font=OLD_DEFAULT).update(font=NEW_DEFAULT)


def noop_reverse(apps, schema_editor):
    """One-way default swap; nothing to undo."""


class Migration(migrations.Migration):

    dependencies = [
        ("tapnote", "0010_note_font"),
    ]

    operations = [
        migrations.AlterField(
            model_name="note",
            name="font",
            field=models.CharField(
                choices=[
                    ("ibm-plex", "IBM Plex Sans"),
                    ("source-sans-3", "Source Sans 3"),
                    ("newsreader", "Newsreader"),
                    ("source-serif-4", "Source Serif 4"),
                    ("eb-garamond", "EB Garamond"),
                ],
                default=NEW_DEFAULT,
                max_length=20,
            ),
        ),
        migrations.RunPython(switch_old_default, noop_reverse),
    ]
