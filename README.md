# scrbl

[English](README.md) | [中文](README_CN.md) | [功能特性](FEATURES.md)

scrbl is a minimalist, self-hosted publishing platform inspired by Telegra.ph, focusing on instant Markdown-based content creation. It provides a distraction-free writing experience with instant publishing capabilities, making it perfect for quick notes, blog posts, or documentation sharing.

[**🔴 Live Demo**](https://zoidbergxgd.pythonanywhere.com/)

**✨ Key Features:**
- 📝 **Telegra.ph Experience**: Supports Title & Author fields, Short URLs
- 🖼️ **Social Preview**: Beautiful preview cards for Telegram/Twitter/WeChat
- 💬 **Comment System**: Paragraph-level comments with ParaNote integration
- 👍 **Like Feature**: Like comments on notes
- 📦 **Data Migration**: Import/Export notes as JSON
- 🚀 **PythonAnywhere Deployment**: Automated deployment scripts
- 🛠️ **Admin Panel**: Django admin interface for content management

> See [FEATURES.md](FEATURES.md) for detailed features and improvements.

![Demo](media/demo.gif)

## Features

- **Minimalist Writing Experience**
  - Clean, distraction-free Markdown editor
  - No account required
  - Instant publishing with a single click
  - Support for full Markdown syntax
  - Self-hosted: maintain full control over your content

- **Content Management**
  - Unique URL for each post (**Optimized 8-char short links**)
  - Support for **Title** and **Author** fields
  - Automatic **Social Media Previews** (Open Graph)
  - Edit functionality with secure tokens
  - Proper rendering of all Markdown elements
  - Support for images and code snippets

- **Advanced Features**
  - 💬 **Paragraph-level comments** with ParaNote integration
  - 👍 **Like system** for comments
  - 📦 **Data migration** (import/export JSON)
  - 🚀 **PythonAnywhere deployment** automation
  - 🧪 **Comprehensive testing** with CI/CD
  - 🛠️ **Django admin** interface

## Quick Start

1. Clone the repository:
```bash
git clone https://github.com/zoidberg-xgd/tapnote.git
cd tapnote
```

2. Start the application using Docker:
```bash
chmod +x setup.sh
./setup.sh
```

3. Access TapNote at `http://localhost:9009`

## Examples

```Markdown
# Heading 1
Some paragraph text here.

![Image](https://themepreview.home.blog/wp-content/uploads/2019/07/boat.jpg)

## Heading 2
Another paragraph of text with some **bold** text, *italic* text, and ~~strikethrough~~ text.

### Heading 3
1. An ordered list item
2. Another ordered list item

'```python
# Some Python code snippet
def greet(name):
    return f"Hello, {name}!"
```'

#### Heading 4
A quote block:
> This is a blockquote!

- Sub list item (unordered)
- Sub list item (unordered)

#### Table Example
| Column A | Column B |
|----------|----------|
| Cell 1A  | Cell 1B  |
| Cell 2A  | Cell 2B  |

https://youtu.be/vz91QpgUjFc?si=6nTE2LeukJprXiw1
```

> Note: For correct rendering of code exmaple remove `'` symbols.

## Limitations

- **Content Size**: For system stability, individual notes are limited to 200,000 characters.
- **Upload Size**: The system enforces a maximum upload size of 2.5MB.

## Testing

TapNote includes comprehensive unit and integration tests covering all major components.

### Running Tests

```bash
# Using Django's test runner
python manage.py test

# Using the test script
./run_tests.sh

# With coverage report
./run_tests.sh --coverage
```

## Contributing

Feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT License](LICENSE)

## Acknowledgments

- Inspired by [Telegra.ph](https://telegra.ph)
- Originally based on concepts from [vorniches/tapnote](https://github.com/vorniches/tapnote)
- Built with Django and Tailwind CSS
- Uses [Prototype](https://github.com/vorniches/prototype), [snap2txt](https://github.com/vorniches/snap2txt) and [Cursor](https://cursor.so)
- Note typography is chosen per note: Newsreader (default), IBM Plex Sans, or EB Garamond, all by Google Fonts
- Comment system powered by [ParaNote](https://github.com/zoidberg-xgd/paranote)

## Support

- Create an issue for bug reports or feature requests
- Star the repository if you find it useful
- Fork it to contribute or create your own version