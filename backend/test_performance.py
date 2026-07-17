"""
Script uji performa & akurasi Readoo AI - /api/chat/text
==========================================================
Pakai file testing/test_queries.csv (dibuat pembimbing), kolom:
    no, pertanyaan, kategori_uji, ekspektasi

Cara pakai:
    python test_performance.py

Sebelum run, pastikan:
1. Backend Flask sudah jalan (python main.py di folder backend)
2. File test_queries.csv ada di folder yang sama dengan script ini
   (atau sesuaikan QUERIES_CSV di bawah kalau ada di subfolder)
3. Sesuaikan BASE_URL dan TOKEN di bawah

Output:
- results_YYYYMMDD_HHMMSS.csv -> detail hasil per query, termasuk kolom
  ekspektasi (buat kamu cek manual apakah hasil sesuai harapan atau enggak)
- Ringkasan statistik performa dicetak di terminal
"""

import csv
import time
import statistics
import requests
from datetime import datetime

# ============ KONFIGURASI - SESUAIKAN DENGAN SETUP KAMU ============
BASE_URL = "http://127.0.0.1:5000"
ENDPOINT = "/api/chat/text"

# Token JWT login kamu. Cara ambil: login lewat browser, buka DevTools -> Application
# -> Local Storage -> cari key 'token', copy value-nya ke sini.
TOKEN = "d5b78268d85166251bb75cef99b47c380a576afbee8e0615423f70ed0d9210cb"

# Sesuaikan path ini kalau test_queries.csv ada di subfolder "testing/"
QUERIES_CSV = "testing/test_queries.csv"
OUTPUT_CSV = f"testing/results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

# Delay antar request (detik) - biar gak kena rate limit (limit=10/60s di backend)
DELAY_BETWEEN_REQUESTS = 6.5
# =====================================================================


def load_queries(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


_session = requests.Session()
_session.trust_env = False  # skip pengecekan proxy sistem Windows, hindari delay di request pertama


def send_query(query: str) -> dict:
    """Kirim satu query ke endpoint chat/text dan ukur response time."""
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {"message": query}

    start = time.perf_counter()
    try:
        res = _session.post(
            f"{BASE_URL}{ENDPOINT}", json=payload, headers=headers, timeout=60
        )
        elapsed = time.perf_counter() - start
        ok = res.status_code == 200
        body = res.json() if ok else {}
        items = body.get("items", [])
        judul_muncul = [it.get("judul", "") for it in items]
        return {
            "status_code": res.status_code,
            "elapsed_sec": round(elapsed, 3),
            "ok": ok,
            "reply": body.get("reply", ""),
            "num_items": len(items),
            "judul_muncul": " | ".join(judul_muncul),
            "error": "" if ok else res.text[:200],
        }
    except requests.exceptions.RequestException as e:
        elapsed = time.perf_counter() - start
        return {
            "status_code": 0,
            "elapsed_sec": round(elapsed, 3),
            "ok": False,
            "reply": "",
            "num_items": 0,
            "judul_muncul": "",
            "error": str(e)[:200],
        }


def main():
    queries = load_queries(QUERIES_CSV)
    print(f"Memuat {len(queries)} query dari {QUERIES_CSV}\n")

    results = []

    for i, row in enumerate(queries, 1):
        query = row["pertanyaan"]
        kategori_uji = row.get("kategori_uji", "")
        ekspektasi = row.get("ekspektasi", "")

        print(f"[{i}/{len(queries)}] '{query}' ({kategori_uji}) ...", end=" ")
        result = send_query(query)
        result["no"] = row.get("no", i)
        result["pertanyaan"] = query
        result["kategori_uji"] = kategori_uji
        result["ekspektasi"] = ekspektasi
        results.append(result)

        status = "OK" if result["ok"] else f"GAGAL ({result['error']})"
        print(f"{result['elapsed_sec']}s -> {status}, items: {result['num_items']}")

        if i < len(queries):
            time.sleep(DELAY_BETWEEN_REQUESTS)

    # Simpan hasil detail ke CSV, kolom ekspektasi disertakan biar gampang
    # dicek manual satu-satu apakah hasilnya sesuai atau tidak
    fieldnames = [
        "no", "pertanyaan", "kategori_uji", "ekspektasi",
        "status_code", "ok", "elapsed_sec", "num_items",
        "judul_muncul", "error", "reply",
    ]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in results:
            writer.writerow(r)

    # Hitung statistik ringkasan performa
    times = [r["elapsed_sec"] for r in results if r["ok"]]
    success_count = sum(1 for r in results if r["ok"])
    fail_count = len(results) - success_count

    print("\n" + "=" * 50)
    print("RINGKASAN HASIL UJI PERFORMA")
    print("=" * 50)
    print(f"Total query      : {len(results)}")
    print(f"Berhasil (HTTP)  : {success_count}")
    print(f"Gagal (HTTP)     : {fail_count}")

    if times:
        sorted_times = sorted(times)
        p95_index = min(int(len(sorted_times) * 0.95), len(sorted_times) - 1)
        print(f"Rata-rata waktu  : {statistics.mean(times):.3f} detik")
        print(f"Median waktu     : {statistics.median(times):.3f} detik")
        print(f"Waktu tercepat   : {min(times):.3f} detik")
        print(f"Waktu terlambat  : {max(times):.3f} detik")
        print(f"P95 waktu        : {sorted_times[p95_index]:.3f} detik")
        if len(times) > 1:
            print(f"Std deviasi      : {statistics.stdev(times):.3f} detik")

    print(f"\nDetail hasil (termasuk kolom ekspektasi) disimpan di: {OUTPUT_CSV}")
    print("Cek manual tiap baris: bandingkan kolom 'judul_muncul' / 'reply'")
    print("dengan kolom 'ekspektasi' untuk menilai AKURASI.")
    print("=" * 50)


if __name__ == "__main__":
    main()