from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
out = root / 'downloads'
out.mkdir(exist_ok=True)
with ZipFile(out / 'Diorama-locale.zip', 'w', ZIP_DEFLATED) as archive:
    archive.write(root / 'offline/Diorama.html', 'Diorama/Diorama.html')
    archive.write(root / 'offline/LEGGIMI.txt', 'Diorama/LEGGIMI.txt')
    archive.write(root / 'public/catalog-template.csv', 'Diorama/modello-catalogo.csv')
    archive.write(root / 'demo/catalogo-esempio.csv', 'Diorama/catalogo-esempio.csv')
files = [root / p for p in ['.gitignore', '.dockerignore', 'README.md', 'Dockerfile', 'compose.yaml', 'package.json', 'package-lock.json', 'server.js', 'store.js', 'catalog.js', 'postgres-store.js']]
for folder in ['public', 'offline', 'demo', 'docs', 'scripts', 'test']:
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
with ZipFile(out / 'Diorama-server.zip', 'w', ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, Path('diorama-books') / path.relative_to(root))
for path in out.glob('*.zip'):
    with ZipFile(path) as archive:
        assert archive.testzip() is None
        assert not any('/data/' in p or '/.git/' in p or p.endswith('/.env') for p in archive.namelist())
    print(path.name, path.stat().st_size, 'bytes, verificato')
