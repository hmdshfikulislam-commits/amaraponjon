package com.amaraponjon.app;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;

import androidx.browser.customtabs.CustomTabsIntent;

public final class MainActivity extends Activity {
    private static final String HOME_URL =
            "https://hmdshfikulislam-commits.github.io/amaraponjon/";
    private static final int BRAND_COLOR = Color.rgb(23, 38, 78);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        CustomTabsIntent browser = new CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setToolbarColor(BRAND_COLOR)
                .setUrlBarHidingEnabled(true)
                .build();
        browser.launchUrl(this, Uri.parse(HOME_URL));
        finish();
    }
}
