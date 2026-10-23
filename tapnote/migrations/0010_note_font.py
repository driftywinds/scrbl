from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tapnote", "0009_english_comment_names"),
    ]

    operations = [
        migrations.AddField(
            model_name="note",
            name="font",
            field=models.CharField(
                choices=[
                    ("newsreader", "Newsreader"),
                    ("ibm-plex", "IBM Plex Sans"),
                    ("eb-garamond", "EB Garamond"),
                ],
                default="newsreader",
                max_length=20,
            ),
        ),
    ]
