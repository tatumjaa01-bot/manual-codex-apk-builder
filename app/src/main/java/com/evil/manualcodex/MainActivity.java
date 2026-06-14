package com.evil.manualcodex;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
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
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;

    private static final int FILE_CHOOSER_REQUEST = 7789;
    private static final String HOME_URL = "file:///android_asset/www/index.html";

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestRuntimePermissions();

        web = new WebView(this);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        if (Build.VERSION.SDK_INT >= 21) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
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

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("OK", (d, w) -> result.confirm())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("OK", (d, w) -> result.confirm())
                        .setNegativeButton("Cancel", (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }
        });

        setContentView(web);

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(HOME_URL);
    }

    private void requestRuntimePermissions() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }
    }

    private byte[] dataUrlToBytes(String dataUrl) throws Exception {
        String s = dataUrl == null ? "" : dataUrl.trim();
        int comma = s.indexOf(',');
        if (comma >= 0) s = s.substring(comma + 1);
        return Base64.decode(s, Base64.DEFAULT);
    }

    public class AndroidBridge {
        @JavascriptInterface
        public String saveBase64Image(String dataUrl, String fileName) {
            try {
                if (fileName == null || fileName.trim().isEmpty()) {
                    fileName = "devil-export-" + System.currentTimeMillis() + ".png";
                }
                if (!fileName.toLowerCase().endsWith(".png")) fileName += ".png";

                byte[] bytes = dataUrlToBytes(dataUrl);

                if (Build.VERSION.SDK_INT >= 29) {
                    ContentResolver resolver = getContentResolver();
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                    values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                    values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/DEVIL Winner Studio");
                    values.put(MediaStore.Images.Media.IS_PENDING, 1);

                    Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new Exception("Cannot create image file");

                    OutputStream out = resolver.openOutputStream(uri);
                    if (out == null) throw new Exception("Cannot open output stream");

                    out.write(bytes);
                    out.flush();
                    out.close();

                    values.clear();
                    values.put(MediaStore.Images.Media.IS_PENDING, 0);
                    resolver.update(uri, values, null, null);

                    return uri.toString();
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "DEVIL Winner Studio");
                    if (!dir.exists()) dir.mkdirs();

                    File outFile = new File(dir, fileName);
                    FileOutputStream fos = new FileOutputStream(outFile);
                    fos.write(bytes);
                    fos.flush();
                    fos.close();

                    return outFile.getAbsolutePath();
                }
            } catch (Exception e) {
                return "SAVE_ERROR: " + e.getMessage();
            }
        }

        @JavascriptInterface
        public void ocrScanImage(String callbackId, String dataUrl) {
            try {
                byte[] bytes = dataUrlToBytes(dataUrl);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);

                if (bitmap == null) {
                    sendOcr(callbackId, errorJson("decode image failed"));
                    return;
                }

                InputImage image = InputImage.fromBitmap(bitmap, 0);
                TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);

                recognizer.process(image)
                        .addOnSuccessListener(result -> {
                            try {
                                JSONObject obj = new JSONObject();
                                JSONArray lines = new JSONArray();

                                for (Text.TextBlock block : result.getTextBlocks()) {
                                    for (Text.Line line : block.getLines()) {
                                        JSONObject item = new JSONObject();
                                        item.put("text", line.getText());

                                        Rect r = line.getBoundingBox();
                                        if (r != null) {
                                            item.put("x", r.left);
                                            item.put("y", r.top);
                                            item.put("w", r.width());
                                            item.put("h", r.height());
                                        }

                                        lines.put(item);
                                    }
                                }

                                obj.put("engine", "mlkit");
                                obj.put("text", result.getText());
                                obj.put("value", result.getText());
                                obj.put("mlkitText", result.getText());
                                obj.put("lines", lines);

                                sendOcr(callbackId, obj.toString());
                            } catch (Exception e) {
                                sendOcr(callbackId, errorJson(e.getMessage()));
                            }
                        })
                        .addOnFailureListener(e -> sendOcr(callbackId, errorJson(e.getMessage())));

            } catch (Exception e) {
                sendOcr(callbackId, errorJson(e.getMessage()));
            }
        }
    }

    private String errorJson(String msg) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("engine", "mlkit");
            obj.put("text", "");
            obj.put("value", "");
            obj.put("mlkitText", "");
            obj.put("lines", new JSONArray());
            obj.put("error", msg == null ? "unknown" : msg);
            return obj.toString();
        } catch (Exception e) {
            return "{\"engine\":\"mlkit\",\"text\":\"\",\"lines\":[]}";
        }
    }

    private void sendOcr(String callbackId, String json) {
        final String safeId = JSONObject.quote(callbackId == null ? "" : callbackId);
        final String safeJson = JSONObject.quote(json == null ? "{}" : json);

        final String js = "window.__DEVIL_NATIVE_OCR_RESOLVE && window.__DEVIL_NATIVE_OCR_RESOLVE("
                + safeId + ", JSON.parse(" + safeJson + "));";

        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
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
