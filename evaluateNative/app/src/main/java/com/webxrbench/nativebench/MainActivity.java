package com.webxrbench.nativebench;

import android.app.Activity;
import android.opengl.GLSurfaceView;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;

public class MainActivity extends Activity {
    private static final String TAG = "NativeBench";
    private GLSurfaceView glView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        int n = getIntent().getIntExtra("n", 4096);
        Log.d(TAG, "n=" + n);

        FrameLayout layout = new FrameLayout(this);

        Button btn = new Button(this);
        btn.setText("Start");
        btn.setOnClickListener(v -> {
            btn.setVisibility(View.GONE);
            glView = new GLSurfaceView(this);
            glView.setEGLContextClientVersion(3);
            glView.setRenderer(new CubeRenderer(n));
            layout.addView(glView, 0);
        });

        layout.addView(btn);
        setContentView(layout);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (glView != null) glView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (glView != null) glView.onResume();
    }
}
