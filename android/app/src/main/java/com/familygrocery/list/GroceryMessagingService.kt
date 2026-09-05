package com.familygrocery.list

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlin.concurrent.thread

/**
 * Receives the digest notifications sent by the sendDigest Cloud Function
 * (functions/index.js) and registers this device's FCM token so that
 * function knows where to send them.
 */
class GroceryMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        registerToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val title = message.notification?.title ?: return
        val body = message.notification?.body ?: ""
        showNotification(title, body)
    }

    private fun showNotification(title: String, body: String) {
        val channelId = "grocery_updates"
        val notificationManager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notificationManager.createNotificationChannel(
                NotificationChannel(channelId, "עדכוני רשימת קניות", NotificationManager.IMPORTANCE_DEFAULT)
            )
        }

        val openAppIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        notificationManager.notify(1, notification)
    }

    companion object {
        // Must match the FAMILY_KEY constant in assets/www/index.html.
        // Stored under /notifyState rather than under /families/{key},
        // because the page's saveToDB() overwrites that whole node on
        // every save — this path is never touched by that write.
        private const val FAMILY_KEY = "my_family_shopping_list_2024"
        private const val DB_URL = "https://family-grocery-list-bd6e3-default-rtdb.firebaseio.com"

        fun registerToken(token: String) {
            thread {
                try {
                    val tokenId = MessageDigest.getInstance("SHA-256")
                        .digest(token.toByteArray())
                        .joinToString("") { "%02x".format(it) }
                    val body = """{"token":"$token","updatedAt":${System.currentTimeMillis()}}"""
                    val url = URL("$DB_URL/notifyState/$FAMILY_KEY/deviceTokens/$tokenId.json")
                    (url.openConnection() as HttpURLConnection).apply {
                        requestMethod = "PUT"
                        doOutput = true
                        setRequestProperty("Content-Type", "application/json")
                        outputStream.use { it.write(body.toByteArray()) }
                        responseCode
                        disconnect()
                    }
                } catch (_: Exception) {
                    // Best-effort — token registration retries on next
                    // app start or the next onNewToken callback.
                }
            }
        }
    }
}
