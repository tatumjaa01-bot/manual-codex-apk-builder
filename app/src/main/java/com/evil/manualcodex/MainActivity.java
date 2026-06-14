package com.evil.manualcodex;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 7789;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        WebSettings s = web.getSettings();

        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);

        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        web.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient());

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;

                Intent intent;
                try {
                    intent = params.createIntent();
                } catch (Exception e) {
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("image/*");
                }

                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

                try {
                    startActivityForResult(Intent.createChooser(intent, "เลือกรูปภาพ"), FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException e) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "ไม่พบแอพสำหรับเลือกรูป", Toast.LENGTH_SHORT).show();
                    return false;
                }

                return true;
            }
        });

        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
    }

    private byte[] decodeDataUrl(String dataUrl) {
        if (dataUrl == null) return new byte[0];
        String s = dataUrl;
        int comma = s.indexOf(",");
        if (comma >= 0) s = s.substring(comma + 1);
        return Base64.decode(s, Base64.DEFAULT);
    }

    private String safeFileName(String name) {
        if (name == null || name.trim().isEmpty()) name = "winner-export-" + System.currentTimeMillis() + ".png";
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (!name.toLowerCase().endsWith(".png")) name += ".png";
        return name;
    }

    private void resolveOcr(String callbackId, JSONObject payload) {
        final String id = callbackId;
        final String json = payload.toString();

        runOnUiThread(() -> {
            String js = "window.__DEVIL_NATIVE_OCR_RESOLVE && window.__DEVIL_NATIVE_OCR_RESOLVE("
                    + JSONObject.quote(id) + "," + JSONObject.quote(json) + ");";
            web.evaluateJavascript(js, null);
        });
    }

    private String runThaiTesseract(Bitmap bitmap) {
        return ""; // safe mode: original OCR plugin not ported yet
    }

    public class AndroidBridge {
        @JavascriptInterface
        public String saveBase64Image(String dataUrl, String fileName) {
            JSONObject out = new JSONObject();

            try {
                byte[] bytes = decodeDataUrl(dataUrl);
                String name = safeFileName(fileName);

                if (bytes.length == 0) throw new Exception("empty image data");

                Uri uri = null;

                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                    values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                    values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/DEVIL Winner Studio");

                    uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new Exception("MediaStore insert failed");

                    OutputStream os = getContentResolver().openOutputStream(uri);
                    if (os == null) throw new Exception("openOutputStream failed");
                    os.write(bytes);
                    os.flush();
                    os.close();
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "DEVIL Winner Studio");
                    if (!dir.exists()) dir.mkdirs();
                    File f = new File(dir, name);
                    FileOutputStream fos = new FileOutputStream(f);
                    fos.write(bytes);
                    fos.flush();
                    fos.close();
                    uri = Uri.fromFile(f);
                }

                out.put("ok", true);
                out.put("uri", String.valueOf(uri));
                out.put("filename", name);
            } catch (Exception e) {
                try {
                    out.put("ok", false);
                    out.put("error", String.valueOf(e.getMessage()));
                } catch (Exception ignored) {}
            }

            return out.toString();
        }

        @JavascriptInterface
        public void ocrScanImage(String callbackId, String dataUrl) {
            final String cb = callbackId;
            final String img = dataUrl;

            new Thread(() -> {
                try {
                    byte[] bytes = decodeDataUrl(img);
                    Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);

                    if (bitmap == null) throw new Exception("decode bitmap failed");

                    final String tessText = ""; // disabled: tess-two native crash guard

                    InputImage image = InputImage.fromBitmap(bitmap, 0);
                    TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);

                    recognizer.process(image)
                            .addOnSuccessListener(text -> {
                                JSONObject out = new JSONObject();
                                JSONArray lines = new JSONArray();

                                try {
                                    for (Text.TextBlock block : text.getTextBlocks()) {
                                        for (Text.Line line : block.getLines()) {
                                            JSONObject o = new JSONObject();
                                            String t = line.getText();
                                            Rect r = line.getBoundingBox();

                                            o.put("text", t == null ? "" : t);
                                            if (r != null) {
                                                o.put("x", r.left);
                                                o.put("y", r.top);
                                                o.put("w", r.width());
                                                o.put("h", r.height());
                                            }
                                            lines.put(o);
                                        }
                                    }

                                    String ml = text.getText() == null ? "" : text.getText();
                                    String both = (ml + "\n" + tessText).trim();

                                    out.put("ok", true);
                                    out.put("engine", "mlkit-safe-no-tess");
                                    out.put("text", both);
                                    out.put("value", both);
                                    out.put("mlkitText", ml);
                                    out.put("tesseractText", tessText);
                                    out.put("paddleText", "");
                                    out.put("lines", lines);
                                } catch (Exception e) {
                                    try {
                                        out.put("ok", false);
                                        out.put("engine", "mlkit-safe-no-tess");
                                        out.put("error", String.valueOf(e.getMessage()));
                                        out.put("text", tessText);
                                        out.put("tesseractText", tessText);
                                        out.put("lines", new JSONArray());
                                    } catch (Exception ignored) {}
                                }

                                resolveOcr(cb, out);
                            })
                            .addOnFailureListener(e -> {
                                JSONObject out = new JSONObject();
                                try {
                                    out.put("ok", true);
                                    out.put("engine", "mlkit-safe-no-tess");
                                    out.put("text", tessText);
                                    out.put("value", tessText);
                                    out.put("mlkitText", "");
                                    out.put("tesseractText", tessText);
                                    out.put("paddleText", "");
                                    out.put("lines", new JSONArray());
                                } catch (Exception ignored) {}
                                resolveOcr(cb, out);
                            });

                } catch (Exception e) {
                    JSONObject out = new JSONObject();
                    try {
                        out.put("ok", false);
                        out.put("engine", "native_error");
                        out.put("error", String.valueOf(e.getMessage()));
                        out.put("text", "");
                        out.put("mlkitText", "");
                        out.put("tesseractText", "");
                        out.put("paddleText", "");
                        out.put("lines", new JSONArray());
                    } catch (Exception ignored) {}
                    resolveOcr(cb, out);
                }
            }).start();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback == null) {
                super.onActivityResult(requestCode, resultCode, data);
                return;
            }

            Uri[] results = null;

            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{ data.getData() };
                } else if (Build.VERSION.SDK_INT >= 21) {
                    results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                }
            }

            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            return;
        }

        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }
}
