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

# bookworm sabit cunku libredwg-tools paketi trixie'de yok (slim default'u
# python image'inin trixie'ye gecince patladi). bookworm Debian 12 = stable.
FROM python:3.11-slim-bookworm

# Sistem paketleri:
#  - libredwg-tools: dwg2dxf binary'i (DWG → DXF cevirisi)
#  - build-essential, gcc: bazi pip paketleri (ezdxf vb.) wheel yoksa icin gerekli
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# libredwg-tools paketi Debian bookworm/trixie'de paketli degil — source'dan
# derliyoruz. dwg2dxf ve digerleri /usr/local/bin altina kurulur, converter.py
# zaten shutil.which("dwg2dxf") ile arar.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates git \
        build-essential gcc autoconf automake libtool pkg-config \
        swig texinfo perl \
        libpcre2-dev && \
    git clone --depth 1 https://github.com/LibreDWG/libredwg.git /tmp/libredwg && \
    cd /tmp/libredwg && \
    sh autogen.sh && \
    ./configure --disable-bindings --disable-docs --disable-static && \
    make -j"$(nproc)" && \
    make install && \
    ldconfig && \
    cd / && rm -rf /tmp/libredwg && \
    # Build-only paketleri sok ki final image kuculsun
    apt-get purge -y --auto-remove \
        git autoconf automake libtool pkg-config \
        swig texinfo perl libpcre2-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    # Sanity: dwg2dxf PATH'te mi
    dwg2dxf --version || (echo "dwg2dxf install fail" && exit 1)

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
