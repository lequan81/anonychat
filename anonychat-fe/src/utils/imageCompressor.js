const MAX_ORIGINAL_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_COMPRESSED_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DIMENSION_PX = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Validates, downscales and compresses an image file into an optimized JPEG Blob.
 *
 * @param {File} file - Original image file from input or paste
 * @returns {Promise<Blob>} - Compressed JPEG Blob ready for chunk streaming
 */
export async function compressImage(file) {
  if (!file) {
    throw new Error('Vui lòng chọn một tệp hình ảnh.');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Chỉ hỗ trợ tệp định dạng hình ảnh.');
  }

  if (file.size > MAX_ORIGINAL_SIZE_BYTES) {
    throw new Error('Ảnh gốc phải nhỏ hơn 20 MB.');
  }

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file);
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_DIMENSION_PX / longestSide);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Không thể khởi tạo Canvas 2D context.');
    }

    // White background to cleanly convert any transparent PNGs to JPEG
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Mã hoá ảnh thất bại'))),
        'image/jpeg',
        JPEG_QUALITY
      );
    });

    if (blob.size > MAX_COMPRESSED_SIZE_BYTES) {
      throw new Error('Ảnh sau khi nén vẫn vượt quá 5 MB.');
    }

    return blob;
  } finally {
    if (bitmap) {
      bitmap.close();
    }
  }
}

export default compressImage;
