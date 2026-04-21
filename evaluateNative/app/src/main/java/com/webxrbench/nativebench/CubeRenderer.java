package com.webxrbench.nativebench;

import android.opengl.GLES30;
import android.opengl.GLSurfaceView;
import android.util.Log;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

public class CubeRenderer implements GLSurfaceView.Renderer {
    private static final String TAG = "CubeRenderer";

    private final int edgeNum;
    private final int actualN;

    // Scene bounds — identical to WebGL side
    private static final float MINX = -1.1f, MAXX = 1.1f;
    private static final float MINY = -2.3f, MAXY = 2.3f;
    private static final float MINZ = -15f,  MAXZ = -3f;
    private static final float SCALE = 0.1f;

    // Camera — identical to WebGL side
    private static final float[] CAMERA_POS    = {0, 0, 3};
    private static final float[] CAMERA_TARGET = {0, 0, -9};
    private static final float[] CAMERA_UP     = {0, 1, 0};
    private static final float FOV  = (float)(45 * Math.PI / 180);
    private static final float NEAR = 0.1f;
    private static final float FAR  = 100f;

    // Shader source — identical GLSL to WebGL side (uOffset as uniform)
    private static final String VS_SOURCE =
        "#version 300 es\n" +
        "layout(location = 0) in vec3 aPosition;\n" +
        "layout(location = 1) in vec3 aNormal;\n" +
        "uniform mat4 uProjection;\n" +
        "uniform mat4 uView;\n" +
        "uniform float uScale;\n" +
        "uniform vec3 uOffset;\n" +
        "out vec3 vNormal;\n" +
        "void main() {\n" +
        "    vec3 worldPos = aPosition * uScale + uOffset;\n" +
        "    vNormal = aNormal;\n" +
        "    gl_Position = uProjection * uView * vec4(worldPos, 1.0);\n" +
        "}\n";

    private static final String FS_SOURCE =
        "#version 300 es\n" +
        "precision mediump float;\n" +
        "in vec3 vNormal;\n" +
        "out vec4 fragColor;\n" +
        "const vec3 uLightDir = vec3(0.5774, 0.5774, 0.5774);\n" +
        "const vec3 uColor = vec3(0.8, 0.4, 0.2);\n" +
        "const float uAmbient = 0.3;\n" +
        "void main() {\n" +
        "    float diff = max(dot(normalize(vNormal), uLightDir), 0.0);\n" +
        "    vec3 color = uColor * (uAmbient + (1.0 - uAmbient) * diff);\n" +
        "    fragColor = vec4(color, 1.0);\n" +
        "}\n";

    // GL handles
    private int program;
    private int uProjectionLoc, uViewLoc, uScaleLoc, uOffsetLoc;

    // Precomputed offsets (flat array: x,y,z, x,y,z, ...)
    private float[] offsets;

    // Measurement
    private int frameCount = 0;
    private long startTime = 0;
    private long totalFT = 0;
    private boolean started = false;
    private boolean logged = false;
    private static final int DURATION = 60;

    public CubeRenderer(int n) {
        this.edgeNum = (int) Math.ceil(Math.cbrt(n));
        this.actualN = edgeNum * edgeNum * edgeNum;
        Log.d(TAG, "N: " + actualN + " edgeNum: " + edgeNum);

        // Precompute offsets — identical to WebGL side
        offsets = new float[actualN * 3];
        int idx = 0;
        for (int i = 0; i < edgeNum; i++) {
            for (int j = 0; j < edgeNum; j++) {
                for (int k = 0; k < edgeNum; k++) {
                    offsets[idx++] = MINX + (MAXX - MINX) / (edgeNum - 1) * i;
                    offsets[idx++] = MINY + (MAXY - MINY) / (edgeNum - 1) * j;
                    offsets[idx++] = MINZ + (MAXZ - MINZ) / (edgeNum - 1) * k;
                }
            }
        }
    }

    @Override
    public void onSurfaceCreated(GL10 unused, EGLConfig config) {
        // Compile shaders — same sequence as WebGL
        int vs = compileShader(GLES30.GL_VERTEX_SHADER, VS_SOURCE);
        int fs = compileShader(GLES30.GL_FRAGMENT_SHADER, FS_SOURCE);
        program = GLES30.glCreateProgram();
        GLES30.glAttachShader(program, vs);
        GLES30.glAttachShader(program, fs);
        GLES30.glLinkProgram(program);
        GLES30.glUseProgram(program);

        // Uniform locations
        uProjectionLoc = GLES30.glGetUniformLocation(program, "uProjection");
        uViewLoc       = GLES30.glGetUniformLocation(program, "uView");
        uScaleLoc      = GLES30.glGetUniformLocation(program, "uScale");
        uOffsetLoc     = GLES30.glGetUniformLocation(program, "uOffset");

        // VAO
        int[] vaos = new int[1];
        GLES30.glGenVertexArrays(1, vaos, 0);
        GLES30.glBindVertexArray(vaos[0]);

        // Cube VBO (position + normal, stride=24, offset 0 and 12)
        int[] vbos = new int[1];
        GLES30.glGenBuffers(1, vbos, 0);

        FloatBuffer cubeData = createCubeVertices();
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbos[0]);
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER,
                cubeData.capacity() * 4, cubeData, GLES30.GL_STATIC_DRAW);
        GLES30.glEnableVertexAttribArray(0);
        GLES30.glVertexAttribPointer(0, 3, GLES30.GL_FLOAT, false, 24, 0);
        GLES30.glEnableVertexAttribArray(1);
        GLES30.glVertexAttribPointer(1, 3, GLES30.GL_FLOAT, false, 24, 12);

        // GL state — identical to WebGL
        GLES30.glEnable(GLES30.GL_DEPTH_TEST);
        GLES30.glEnable(GLES30.GL_CULL_FACE);
        GLES30.glClearColor(0.1f, 0.1f, 0.1f, 1.0f);

        // View matrix + scale (don't change per frame)
        GLES30.glUniformMatrix4fv(uViewLoc, 1, false,
                lookAt(CAMERA_POS, CAMERA_TARGET, CAMERA_UP), 0);
        GLES30.glUniform1f(uScaleLoc, SCALE);
    }

    @Override
    public void onSurfaceChanged(GL10 unused, int width, int height) {
        GLES30.glViewport(0, 0, width, height);
        float aspect = (float) width / height;
        GLES30.glUseProgram(program);
        GLES30.glUniformMatrix4fv(uProjectionLoc, 1, false,
                perspective(FOV, aspect, NEAR, FAR), 0);
    }

    @Override
    public void onDrawFrame(GL10 unused) {
        long now = System.nanoTime();
        if (!started) {
            startTime = now;
            started = true;
            Log.d(TAG, "render start");
        }

        // Draw — per-object draw call, identical to WebGL
        // --- Frame Time measurement start ---
        long t0 = System.nanoTime();
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT | GLES30.GL_DEPTH_BUFFER_BIT);
        for (int i = 0; i < actualN; i++) {
            GLES30.glUniform3f(uOffsetLoc, offsets[i*3], offsets[i*3+1], offsets[i*3+2]);
            GLES30.glDrawArrays(GLES30.GL_TRIANGLES, 0, 36);
        }
        long ft = System.nanoTime() - t0;
        totalFT += ft;
        // --- Frame Time measurement end ---

        frameCount++;
        if (frameCount % 1000 == 0) {
            double fps = 1e9 * frameCount / (now - startTime);
            double avgFT = totalFT / 1e6 / frameCount;
            Log.d(TAG, frameCount + " " + String.format("%.1f", fps) + " fps " +
                    String.format("%.3f", avgFT) + " ms/frame");
        }
        double elapsed = (now - startTime) / 1e9;
        if (elapsed > DURATION && !logged) {
            logged = true;
            double fps = 1e9 * frameCount / (now - startTime);
            double avgFT = totalFT / 1e6 / frameCount;
            Log.d(TAG, "done " + String.format("%.1f", elapsed) +
                    " " + frameCount + " " + String.format("%.1f", fps) + " fps " +
                    String.format("%.3f", avgFT) + " ms/frame");
        }
    }

    // ===== Helper: compile shader =====
    private int compileShader(int type, String source) {
        int shader = GLES30.glCreateShader(type);
        GLES30.glShaderSource(shader, source);
        GLES30.glCompileShader(shader);
        int[] compiled = new int[1];
        GLES30.glGetShaderiv(shader, GLES30.GL_COMPILE_STATUS, compiled, 0);
        if (compiled[0] == 0) {
            Log.e(TAG, "Shader compile error: " + GLES30.glGetShaderInfoLog(shader));
            GLES30.glDeleteShader(shader);
            return 0;
        }
        return shader;
    }

    // ===== Cube geometry — identical vertex data to WebGL =====
    private FloatBuffer createCubeVertices() {
        float p = 0.5f;
        float[] data = {
            // Front (z=+p), normal (0,0,1)
            -p,-p, p, 0,0,1,  p,-p, p, 0,0,1,  p, p, p, 0,0,1,
            -p,-p, p, 0,0,1,  p, p, p, 0,0,1, -p, p, p, 0,0,1,
            // Back (z=-p), normal (0,0,-1)
             p,-p,-p, 0,0,-1, -p,-p,-p, 0,0,-1, -p, p,-p, 0,0,-1,
             p,-p,-p, 0,0,-1, -p, p,-p, 0,0,-1,  p, p,-p, 0,0,-1,
            // Right (x=+p), normal (1,0,0)
             p,-p, p, 1,0,0,  p,-p,-p, 1,0,0,  p, p,-p, 1,0,0,
             p,-p, p, 1,0,0,  p, p,-p, 1,0,0,  p, p, p, 1,0,0,
            // Left (x=-p), normal (-1,0,0)
            -p,-p,-p,-1,0,0, -p,-p, p,-1,0,0, -p, p, p,-1,0,0,
            -p,-p,-p,-1,0,0, -p, p, p,-1,0,0, -p, p,-p,-1,0,0,
            // Top (y=+p), normal (0,1,0)
            -p, p, p, 0,1,0,  p, p, p, 0,1,0,  p, p,-p, 0,1,0,
            -p, p, p, 0,1,0,  p, p,-p, 0,1,0, -p, p,-p, 0,1,0,
            // Bottom (y=-p), normal (0,-1,0)
            -p,-p,-p, 0,-1,0, p,-p,-p, 0,-1,0,  p,-p, p, 0,-1,0,
            -p,-p,-p, 0,-1,0, p,-p, p, 0,-1,0, -p,-p, p, 0,-1,0,
        };
        FloatBuffer buf = ByteBuffer.allocateDirect(data.length * 4)
                .order(ByteOrder.nativeOrder()).asFloatBuffer();
        buf.put(data).position(0);
        return buf;
    }

    // ===== Matrix: perspective — identical math to WebGL =====
    private float[] perspective(float fov, float aspect, float near, float far) {
        float f = 1.0f / (float) Math.tan(fov / 2);
        float nf = 1.0f / (near - far);
        // column-major
        return new float[] {
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (far + near) * nf, -1,
            0, 0, 2 * far * near * nf, 0
        };
    }

    // ===== Matrix: lookAt — identical math to WebGL =====
    private float[] lookAt(float[] eye, float[] center, float[] up) {
        float fx = center[0]-eye[0], fy = center[1]-eye[1], fz = center[2]-eye[2];
        float len = (float) Math.sqrt(fx*fx + fy*fy + fz*fz);
        fx /= len; fy /= len; fz /= len;
        float sx = fy*up[2]-fz*up[1], sy = fz*up[0]-fx*up[2], sz = fx*up[1]-fy*up[0];
        len = (float) Math.sqrt(sx*sx + sy*sy + sz*sz);
        sx /= len; sy /= len; sz /= len;
        float ux = sy*fz-sz*fy, uy = sz*fx-sx*fz, uz = sx*fy-sy*fx;
        // column-major
        return new float[] {
            sx, ux, -fx, 0,
            sy, uy, -fy, 0,
            sz, uz, -fz, 0,
            -(sx*eye[0]+sy*eye[1]+sz*eye[2]),
            -(ux*eye[0]+uy*eye[1]+uz*eye[2]),
            (fx*eye[0]+fy*eye[1]+fz*eye[2]),
            1
        };
    }
}
