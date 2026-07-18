
import zipfile
import os

# Create a zip of the entire project
zip_path = '/mnt/agents/output/efootball-game.zip'
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk('/mnt/agents/output/efootball-game'):
        for file in files:
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, '/mnt/agents/output/efootball-game')
            zipf.write(file_path, arcname)

size = os.path.getsize(zip_path)
print(f"Project zip created: {size:,} bytes")
