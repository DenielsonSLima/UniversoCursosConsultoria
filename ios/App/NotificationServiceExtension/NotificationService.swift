import Foundation
import UniformTypeIdentifiers
import UserNotifications

final class NotificationService: UNNotificationServiceExtension, URLSessionDownloadDelegate {
    private static let maximumImageBytes: Int64 = 5 * 1024 * 1024
    private static let downloadTimeout: TimeInterval = 12
    private static let allowedImageHost = "kfekgwyqozhicpfuunpo.supabase.co"
    private static let allowedImagePathPattern =
        #"^/storage/v1/object/public/push-notification-images/(?:campaigns|birthday)/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|jpeg|png)$"#

    private let deliveryLock = NSLock()
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var fallbackContent: UNNotificationContent?
    private var bestAttemptContent: UNMutableNotificationContent?
    private var session: URLSession?
    private var downloadTask: URLSessionDownloadTask?
    private var timeoutWorkItem: DispatchWorkItem?
    private var sourceURL: URL?
    private var didDeliver = false

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        fallbackContent = request.content
        bestAttemptContent = request.content.mutableCopy() as? UNMutableNotificationContent

        guard
            let imageURLString = request.content.userInfo["image_url"] as? String,
            let imageURL = URL(string: imageURLString),
            isAllowedHTTPSURL(imageURL)
        else {
            finish()
            return
        }

        sourceURL = imageURL
        startDownload(from: imageURL)
    }

    override func serviceExtensionTimeWillExpire() {
        finish()
    }

    private func startDownload(from imageURL: URL) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = Self.downloadTimeout
        configuration.timeoutIntervalForResource = Self.downloadTimeout
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.waitsForConnectivity = false

        let delegateQueue = OperationQueue()
        delegateQueue.maxConcurrentOperationCount = 1
        delegateQueue.qualityOfService = .utility

        let session = URLSession(
            configuration: configuration,
            delegate: self,
            delegateQueue: delegateQueue
        )
        self.session = session

        var request = URLRequest(
            url: imageURL,
            cachePolicy: .reloadIgnoringLocalCacheData,
            timeoutInterval: Self.downloadTimeout
        )
        request.httpMethod = "GET"
        request.setValue("image/*", forHTTPHeaderField: "Accept")

        let task = session.downloadTask(with: request)
        downloadTask = task

        let timeoutWorkItem = DispatchWorkItem { [weak self] in
            self?.finish()
        }
        self.timeoutWorkItem = timeoutWorkItem
        DispatchQueue.global(qos: .utility).asyncAfter(
            deadline: .now() + Self.downloadTimeout,
            execute: timeoutWorkItem
        )

        task.resume()
    }

    private func isAllowedHTTPSURL(_ url: URL) -> Bool {
        guard let components = URLComponents(
            url: url,
            resolvingAgainstBaseURL: false
        ) else {
            return false
        }

        return components.scheme?.lowercased() == "https"
            && components.host?.lowercased() == Self.allowedImageHost
            && components.port == nil
            && components.user == nil
            && components.password == nil
            && components.percentEncodedQuery == nil
            && components.percentEncodedFragment == nil
            && components.percentEncodedPath.range(
                of: Self.allowedImagePathPattern,
                options: String.CompareOptions.regularExpression
            ) != nil
    }

    private func imageFileExtension(
        for response: URLResponse?,
        sourceURL: URL?
    ) -> String? {
        for candidateURL in [response?.url, sourceURL].compactMap({ $0 }) {
            let pathExtension = candidateURL.pathExtension.lowercased()
            guard
                !pathExtension.isEmpty,
                pathExtension.count <= 10,
                pathExtension.unicodeScalars.allSatisfy(CharacterSet.alphanumerics.contains),
                let type = UTType(filenameExtension: pathExtension),
                type.conforms(to: .image)
            else {
                continue
            }
            return pathExtension
        }

        guard
            let mimeType = response?.mimeType,
            let type = UTType(mimeType: mimeType),
            type.conforms(to: .image)
        else {
            return nil
        }
        return type.preferredFilenameExtension
    }

    private func makeAttachment(
        from temporaryURL: URL,
        response: URLResponse?
    ) throws -> UNNotificationAttachment {
        let resourceValues = try temporaryURL.resourceValues(forKeys: [.fileSizeKey])
        guard
            let fileSize = resourceValues.fileSize,
            fileSize > 0,
            Int64(fileSize) <= Self.maximumImageBytes,
            let pathExtension = imageFileExtension(for: response, sourceURL: sourceURL)
        else {
            throw AttachmentError.invalidImage
        }

        let attachmentDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(
            at: attachmentDirectory,
            withIntermediateDirectories: true
        )
        let attachmentURL = attachmentDirectory
            .appendingPathComponent("notification-image")
            .appendingPathExtension(pathExtension)
        try FileManager.default.moveItem(at: temporaryURL, to: attachmentURL)

        return try UNNotificationAttachment(
            identifier: "notification-image",
            url: attachmentURL,
            options: nil
        )
    }

    private func finish(with attachment: UNNotificationAttachment? = nil) {
        deliveryLock.lock()
        guard
            !didDeliver,
            let contentHandler,
            let content = bestAttemptContent ?? fallbackContent
        else {
            deliveryLock.unlock()
            return
        }

        didDeliver = true
        if let attachment, let bestAttemptContent {
            bestAttemptContent.attachments.append(attachment)
        }

        self.contentHandler = nil
        let timeoutWorkItem = self.timeoutWorkItem
        self.timeoutWorkItem = nil
        let downloadTask = self.downloadTask
        self.downloadTask = nil
        let session = self.session
        self.session = nil
        deliveryLock.unlock()

        timeoutWorkItem?.cancel()
        downloadTask?.cancel()
        session?.invalidateAndCancel()
        contentHandler(content)
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        guard let redirectURL = request.url, isAllowedHTTPSURL(redirectURL) else {
            completionHandler(nil)
            finish()
            return
        }
        completionHandler(request)
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        guard
            totalBytesWritten <= Self.maximumImageBytes,
            totalBytesExpectedToWrite <= 0
                || totalBytesExpectedToWrite <= Self.maximumImageBytes
        else {
            downloadTask.cancel()
            finish()
            return
        }
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        guard
            let response = downloadTask.response as? HTTPURLResponse,
            (200..<300).contains(response.statusCode)
        else {
            finish()
            return
        }

        do {
            let attachment = try makeAttachment(from: location, response: response)
            finish(with: attachment)
        } catch {
            finish()
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        if error != nil {
            finish()
        }
    }
}

private enum AttachmentError: Error {
    case invalidImage
}
