# JavaScript bridge methods are kept because WebView invokes them by name.
-keepclassmembers class ru.galamart.markdownmanager.MainActivity$AndroidBridge {
    public <methods>;
}
