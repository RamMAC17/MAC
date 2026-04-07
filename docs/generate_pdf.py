"""Generate PDF from MAC API Design Document markdown."""
import markdown2
from xhtml2pdf import pisa
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent

# Read the markdown file
md_text = (SCRIPT_DIR / "MAC-API-Design-Document.md").read_text(encoding="utf-8")

# Convert markdown to HTML with extras
html_body = markdown2.markdown(
    md_text,
    extras=["tables", "fenced-code-blocks", "code-friendly", "header-ids", "break-on-newline"]
)

# Professional CSS styling
css = """
@page {
    size: A4;
    margin: 2cm 2.2cm 2cm 2.2cm;
    @frame footer {
        -pdf-frame-content: footerContent;
        bottom: 0.5cm;
        margin-left: 2.2cm;
        margin-right: 2.2cm;
        height: 1cm;
    }
}
body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.55;
    color: #1a1a1a;
}
h1 {
    font-size: 22pt;
    color: #0d1b2a;
    border-bottom: 2.5pt solid #1b4965;
    padding-bottom: 6pt;
    margin-top: 28pt;
    margin-bottom: 14pt;
    page-break-after: avoid;
}
h2 {
    font-size: 16pt;
    color: #1b4965;
    border-bottom: 1pt solid #c8d6e5;
    padding-bottom: 4pt;
    margin-top: 22pt;
    margin-bottom: 10pt;
    page-break-after: avoid;
}
h3 {
    font-size: 13pt;
    color: #2a6f97;
    margin-top: 16pt;
    margin-bottom: 8pt;
    page-break-after: avoid;
}
h4 {
    font-size: 11pt;
    color: #2a6f97;
    margin-top: 12pt;
    margin-bottom: 6pt;
}
table {
    width: 100%;
    border-collapse: collapse;
    margin: 10pt 0 14pt 0;
    font-size: 9pt;
}
th {
    background-color: #1b4965;
    color: #ffffff;
    padding: 7pt 8pt;
    text-align: left;
    font-weight: bold;
    border: 0.5pt solid #1b4965;
}
td {
    padding: 6pt 8pt;
    border: 0.5pt solid #d0d7de;
    vertical-align: top;
}
tr:nth-child(even) td {
    background-color: #f6f8fa;
}
code {
    font-family: Courier, monospace;
    font-size: 8.5pt;
    background-color: #f0f2f5;
    padding: 1pt 3pt;
    border-radius: 2pt;
    color: #c7254e;
}
pre {
    background-color: #f0f2f5;
    border: 0.5pt solid #d0d7de;
    border-radius: 4pt;
    padding: 10pt 12pt;
    font-family: Courier, monospace;
    font-size: 8pt;
    line-height: 1.45;
    overflow-x: auto;
    margin: 8pt 0 12pt 0;
    page-break-inside: avoid;
}
pre code {
    background-color: transparent;
    padding: 0;
    color: #1a1a1a;
    font-size: 8pt;
}
blockquote {
    border-left: 3pt solid #1b4965;
    margin: 10pt 0;
    padding: 8pt 14pt;
    background-color: #f0f7fb;
    font-style: italic;
    color: #333;
}
hr {
    border: none;
    border-top: 1.5pt solid #1b4965;
    margin: 20pt 0;
}
a {
    color: #1b4965;
    text-decoration: none;
}
p {
    margin: 4pt 0 8pt 0;
}
ul, ol {
    margin: 4pt 0 10pt 16pt;
    padding: 0;
}
li {
    margin-bottom: 3pt;
}
strong {
    color: #0d1b2a;
}

/* Title page styling */
.cover-title {
    font-size: 36pt;
    color: #0d1b2a;
    font-weight: bold;
    text-align: center;
    margin-top: 120pt;
    margin-bottom: 10pt;
}
.cover-subtitle {
    font-size: 16pt;
    color: #1b4965;
    text-align: center;
    margin-bottom: 40pt;
}
.cover-meta {
    font-size: 11pt;
    color: #555;
    text-align: center;
    line-height: 1.8;
}
"""

# Build complete HTML document
cover_page = """
<div style="page-break-after: always;">
    <div class="cover-title">MAC</div>
    <div class="cover-subtitle">MBM AI Cloud</div>
    <div style="text-align:center; margin-bottom: 40pt;">
        <hr style="width:40%; margin: 0 auto; border-top: 2pt solid #1b4965;">
    </div>
    <div class="cover-subtitle" style="font-size: 14pt; color: #333;">
        API Design &amp; Architecture Plan
    </div>
    <div class="cover-subtitle" style="font-size: 12pt; color: #555;">
        Phase 1&ndash;8 &middot; Complete Platform Blueprint
    </div>
    <br/><br/><br/>
    <div class="cover-meta">
        Prepared for Professor Review<br/>
        07 April 2026<br/><br/>
        Self-Hosted AI Inference Platform<br/>
        MBM Engineering College
    </div>
    <br/><br/><br/><br/><br/><br/>
    <div style="text-align:center; font-size: 9pt; color: #999;">
        Confidential &mdash; For Internal Academic Review Only
    </div>
</div>
"""

full_html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>{css}</style>
</head>
<body>
    {cover_page}
    {html_body}
    <div id="footerContent" style="text-align: center; font-size: 8pt; color: #999;">
        MAC &mdash; MBM AI Cloud &middot; API Design Document &middot; v1.0
    </div>
</body>
</html>"""

# Generate PDF
output_path = SCRIPT_DIR / "MAC-API-Design-Document.pdf"
with open(output_path, "wb") as pdf_file:
    status = pisa.CreatePDF(full_html, dest=pdf_file)

if status.err:
    print(f"ERROR: PDF generation failed with {status.err} errors")
else:
    size_kb = output_path.stat().st_size / 1024
    print(f"PDF generated successfully: {output_path}")
    print(f"File size: {size_kb:.0f} KB")
