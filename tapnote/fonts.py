"""Typography choices a note author can pick from.

Each entry keeps the three things that must stay in sync in one place:

* ``label``          - what the editor dropdown shows
* ``google_family``  - the family query for Google Fonts
* ``css_stack``      - the CSS fallback chain used when the webfont is unavailable

The keys are stored in ``Note.font``, so they are effectively a database
contract: do not rename an existing key without a data migration.
"""

DEFAULT_FONT = "ibm-plex"

FONTS = {
    # Sans-serif
    "ibm-plex": {
        "label": "IBM Plex Sans",
        "google_family": "IBM+Plex+Sans:ital,wght@0,400;0,600;1,400",
        "css_stack": "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
    },
    "source-sans-3": {
        "label": "Source Sans 3",
        "google_family": "Source+Sans+3:ital,wght@0,400;0,600;1,400",
        "css_stack": "'Source Sans 3', 'Source Sans Pro', system-ui, -apple-system, 'Segoe UI', sans-serif",
    },
    # Serif
    "newsreader": {
        "label": "Newsreader",
        "google_family": "Newsreader:ital,wght@0,400;0,600;1,400",
        "css_stack": "'Newsreader', Georgia, 'Times New Roman', serif",
    },
    "source-serif-4": {
        "label": "Source Serif 4",
        "google_family": "Source+Serif+4:ital,wght@0,400;0,600;1,400",
        "css_stack": "'Source Serif 4', 'Source Serif Pro', Georgia, 'Times New Roman', serif",
    },
    "eb-garamond": {
        "label": "EB Garamond",
        "google_family": "EB+Garamond:ital,wght@0,400;0,600;1,400",
        "css_stack": "'EB Garamond', Garamond, Georgia, serif",
    },
}

# (value, label) pairs for model choices
FONT_CHOICES = [(key, meta["label"]) for key, meta in FONTS.items()]


def font_options():
    """Full font metadata for the editor (dropdown + live preview)."""
    return [
        {
            "value": key,
            "label": meta["label"],
            "google_family": meta["google_family"],
            "css_stack": meta["css_stack"],
        }
        for key, meta in FONTS.items()
    ]


def normalize_font(value):
    """Return a valid font key, falling back to the default."""
    if value in FONTS:
        return value
    return DEFAULT_FONT


def font_css_stack(value):
    """Return the CSS font stack for a font key."""
    return FONTS[normalize_font(value)]["css_stack"]
