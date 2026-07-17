import React from 'react';
import type { ChatItem } from '../../types';

interface ItemCardProps {
  item: ChatItem;
}

// Field yang WAJIB diprioritasin urutan tampilnya, apapun urutan asli JSON
// dari backend (chat mode & avatar mode kadang beda urutan field-nya).
const PRIORITY_FIELDS = ['judul', 'pengarang', 'kode_buku', 'kode'];

export const ItemCard: React.FC<ItemCardProps> = ({ item }) => {
  // FIX: sumber gambar cover sekarang dari field `image_base64` (isinya URL Open
  // Library, bukan cover_image lagi — nama field ini peninggalan lama sebelum
  // dataset diganti dari base64 ke URL, tapi biar aman kita dukung dua-duanya).
  const coverSrc = (item as any).image_base64 || (item as any).cover_image;

  // Filter out system/UI specific keys, termasuk field gambar biar gak
  // ikut ditampilkan sebagai teks mentah.
  const allEntries = Object.entries(item).filter(
    ([k]) => !['id', 'cover_image', 'cover_color', 'image_base64'].includes(k)
  );

  // FIX: dulu cuma slice(0, 3) dari urutan asli JSON — jadi kalau backend
  // ngirim field dengan urutan beda (misal avatar mode duluan "abstraksi",
  // chat mode duluan "judul"), card yang tampil ikut beda juga.
  // Sekarang field prioritas (judul/pengarang/kode) SELALU didahulukan,
  // baru sisanya, biar avatar mode & chat mode konsisten tampilannya.
  const displayFields = [
    ...PRIORITY_FIELDS
      .map((pf) => allEntries.find(([k]) => k === pf))
      .filter((e): e is [string, unknown] => Boolean(e)),
    ...allEntries.filter(([k]) => !PRIORITY_FIELDS.includes(k)),
  ].slice(0, 3);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex gap-3 items-start">
      {coverSrc && (
        <img
          src={coverSrc as string}
          alt=""
          className="w-16 h-20 object-cover rounded-lg flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        {displayFields.map(([key, val]) => (
          <p key={key} className="text-sm text-gray-700 dark:text-gray-300 truncate">
            <span className="font-medium capitalize">{key}: </span>
            {String(val)}
          </p>
        ))}
      </div>
    </div>
  );
};