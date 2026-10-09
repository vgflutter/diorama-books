from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from shutil import copyfile
root = Path(__file__).resolve().parent.parent
out = root / 'downloads'
out.mkdir(exist_ok=True)
with ZipFile(out / 'dioramaBooks-locale.zip', 'w', ZIP_DEFLATED) as archive:
    archive.write(root / 'offline/dioramaBooks.html', 'dioramaBooks/dioramaBooks.html')
    archive.write(root / 'offline/LEGGIMI.txt', 'dioramaBooks/LEGGIMI.txt')
    archive.write(root / 'public/catalog-template.csv', 'dioramaBooks/modello-catalogo.csv')
    archive.write(root / 'demo/catalogo-esempio.csv', 'dioramaBooks/catalogo-esempio.csv')
files = [root / p for p in ['.gitignore', '.dockerignore', 'README.md', 'Dockerfile', 'compose.yaml', 'package.json', 'package-lock.json', 'server.js', 'store.js', 'order-data.js', 'catalog.js', 'postgres-store.js']]
for folder in ['public', 'offline', 'demo', 'docs', 'scripts', 'test']:
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
with ZipFile(out / 'dioramaBooks-server.zip', 'w', ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, Path('dioramaBooks') / path.relative_to(root))
# Keep previously shared GitHub download URLs usable.
for edition in ['locale', 'server']:
    copyfile(out / f'dioramaBooks-{edition}.zip', out / f'Diorama-{edition}.zip')
for path in out.glob('*.zip'):
    with ZipFile(path) as archive:
        assert archive.testzip() is None
        assert not any('/data/' in p or '/.git/' in p or p.endswith('/.env') for p in archive.namelist())
    print(path.name, path.stat().st_size, 'bytes, verificato')
