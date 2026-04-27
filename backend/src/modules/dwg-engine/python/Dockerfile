# ─────────────────────────────────────────────────────────────────
#  MetaPrice DWG Engine — Docker image
# ─────────────────────────────────────────────────────────────────
#  Render'in Native Python runtime'i sistem paketi (apt-get) yuklemiyor.
#  DWG → DXF cevirimi icin libredwg-tools'a ihtiyacimiz var (komut: dwg2dxf).
#  Bu yuzden Python servisini Dockerfile ile sariyoruz.
#
#  Render bu Dockerfile'i otomatik bulur (rootDir altinda), `runtime: docker`
#  oldugu surece buildCommand ve startCommand kullanmaz.
# ─────────────────────────────────────────────────────────────────

FROM python:3.11-slim

# Sistem paketleri:
#  - libredwg-tools: dwg2dxf binary'i (DWG → DXF cevirisi)
#  - build-essential, gcc: bazi pip paketleri (ezdxf vb.) icin gerekli
#  - libpcre3-dev: ezdxf'in optional dependencies icin
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libredwg-tools \
        build-essential \
        gcc \
        libpcre3-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Once requirements'i kopyala — Docker layer cache icin
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Sonra kaynak kodu — kod degisikliginde sadece bu layer rebuild olur
COPY *.py ./

# Render PORT env'ini set eder (default 10000), main.py kendisi okur
EXPOSE 10000

CMD ["python", "main.py"]
