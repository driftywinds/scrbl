from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tapnote", "0011_note_font_default"),
    ]

    operations = [
        migrations.AlterField(
            model_name="note",
            name="font",
            field=models.CharField(
                choices=[
                    ("ibm-plex", "IBM Plex Sans"),
                    ("source-sans-3", "Source Sans 3"),
                    ("allo", "Allo"),
                    ("newsreader", "Newsreader"),
                    ("source-serif-4", "Source Serif 4"),
                    ("eb-garamond", "EB Garamond"),
                ],
                default="ibm-plex",
                max_length=20,
            ),
        ),
    ]
