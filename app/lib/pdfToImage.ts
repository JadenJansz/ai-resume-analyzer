export interface PdfConversionResult {
  imageUrl: string;
  file: File | null;
  error?: string;
}

let pdfjsLib: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  if (loadPromise) return loadPromise;

  isLoading = true;

  try {
    // @ts-ignore
    loadPromise = import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";
      pdfjsLib = lib;
      isLoading = false;
      return lib;
    });
  } catch (error) {
    // @ts-ignore
    loadPromise = import("pdfjs-dist/build/pdf.mjs").then((lib) => {
      // Solution 2: Use the worker from the same package
      lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;
      pdfjsLib = lib;
      isLoading = false;
      return lib;
    });
  }

  return loadPromise;
}

// Alternative loading function with version-specific CDN
async function loadPdfJsFromCDN(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  if (loadPromise) return loadPromise;

  isLoading = true;

  // Load specific version from CDN to ensure compatibility
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js";
    script.onload = () => {
      // @ts-expect-error - pdfjsLib is added to window by the script
      const lib = window.pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";
      pdfjsLib = lib;
      isLoading = false;
      resolve(lib);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return loadPromise;
}

export async function convertPdfToImage(
  file: File,
  useAlternativeLoader = false
): Promise<PdfConversionResult> {
  try {
    // Choose loading method
    const lib = useAlternativeLoader
      ? await loadPdfJsFromCDN()
      : await loadPdfJs();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 4 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    if (context) {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
    }

    await page.render({ canvasContext: context!, viewport }).promise;

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            // Create a File from the blob with the same name as the pdf
            const originalName = file.name.replace(/\.pdf$/i, "");
            const imageFile = new File([blob], `${originalName}.png`, {
              type: "image/png",
            });

            resolve({
              imageUrl: URL.createObjectURL(blob),
              file: imageFile,
            });
          } else {
            resolve({
              imageUrl: "",
              file: null,
              error: "Failed to create image blob",
            });
          }
        },
        "image/png",
        1.0
      );
    });
  } catch (err) {
    console.log(err);
    return {
      imageUrl: "",
      file: null,
      error: `Failed to convert PDF: ${err}`,
    };
  }
}

// Utility function to check PDF.js version compatibility
export function checkPdfJsVersion(): Promise<{
  api: string;
  worker: string;
  compatible: boolean;
}> {
  return new Promise((resolve) => {
    loadPdfJs()
      .then((lib) => {
        const apiVersion = lib.version;
        // We can't directly check worker version without loading it, but we can infer compatibility
        resolve({
          api: apiVersion,
          worker: "CDN-matched",
          compatible: true,
        });
      })
      .catch(() => {
        resolve({
          api: "unknown",
          worker: "unknown",
          compatible: false,
        });
      });
  });
}
