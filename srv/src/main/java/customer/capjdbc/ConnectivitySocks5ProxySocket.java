package customer.capjdbc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketAddress;
import java.net.SocketException;
import java.net.URI;
import java.nio.ByteBuffer;

import java.util.Base64; // or any other library for base64 encoding

import org.cloudfoundry.identity.client.token.GrantType;

import org.cloudfoundry.identity.client.UaaContext;
import org.cloudfoundry.identity.client.UaaContextFactory;
import org.cloudfoundry.identity.client.token.TokenRequest;
import org.cloudfoundry.identity.uaa.oauth.token.CompositeAccessToken;
import org.json.JSONArray; // or any other library for JSON objects
import org.json.JSONObject; // or any other library for JSON objects
import org.json.JSONException; // or any other library for JSON objects
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
 
public class ConnectivitySocks5ProxySocket extends Socket {
 
    private static final Logger LOGGER = LoggerFactory.getLogger(ConnectivitySocks5ProxySocket.class);   

    private static final byte SOCKS5_VERSION = 0x05;
    private static final byte SOCKS5_JWT_AUTHENTICATION_METHOD = (byte) 0x80;
    private static final byte SOCKS5_JWT_AUTHENTICATION_METHOD_VERSION = 0x01;
    private static final byte SOCKS5_COMMAND_CONNECT_BYTE = 0x01;
    private static final byte SOCKS5_COMMAND_REQUEST_RESERVED_BYTE = 0x00;
    private static final byte SOCKS5_COMMAND_ADDRESS_TYPE_IPv4_BYTE = 0x01;
    private static final byte SOCKS5_COMMAND_ADDRESS_TYPE_DOMAIN_BYTE = 0x03;
    private static final byte SOCKS5_AUTHENTICATION_METHODS_COUNT = 0x01;
    private static final int SOCKS5_JWT_AUTHENTICATION_METHOD_UNSIGNED_VALUE = 0x80 & 0xFF;
    private static final byte SOCKS5_AUTHENTICATION_SUCCESS_BYTE = 0x00;
 
    private static final String SOCKS5_PROXY_HOST_PROPERTY = "onpremise_proxy_host";
    private static final String SOCKS5_PROXY_PORT_PROPERTY = "onpremise_socks5_proxy_port";
 
    private  String jwtToken;
    private  String sccLocationId;
 
    public ConnectivitySocks5ProxySocket() {
       this.sccLocationId="";
    }
    public ConnectivitySocks5ProxySocket(String jwtToken, String sccLocationId) {
        this.jwtToken = jwtToken;
        this.sccLocationId = sccLocationId != null ? Base64.getEncoder().encodeToString(sccLocationId.getBytes()) : "";
    }
    public InetSocketAddress getProxyAddress() {
        try {
            JSONObject jsonObjXsuaa = new JSONObject(System.getenv("VCAP_SERVICES"));
            JSONArray jsonArrXsuaa = jsonObjXsuaa.getJSONArray("xsuaa");
            JSONObject xsuaaCredentials = jsonArrXsuaa.getJSONObject(0).getJSONObject("credentials");

            JSONObject credentials = extractEnvironmentCredentials();
            String proxyHost = credentials.getString(SOCKS5_PROXY_HOST_PROPERTY);
            int proxyPort = Integer.parseInt(credentials.getString(SOCKS5_PROXY_PORT_PROPERTY));

            //***************retrieve token Start*****************
            // get value of "clientid" and "clientsecret" from the environment variables
            String clientid = credentials.getString("clientid");
            String clientsecret = credentials.getString("clientsecret");
            
            // get the URL to xsuaa from the environment variables
            URI xsuaaUrl = new URI(xsuaaCredentials.getString("url"));
            UaaContextFactory factory = UaaContextFactory.factory(xsuaaUrl).authorizePath("/oauth/authorize").tokenPath("/oauth/token");
            TokenRequest tokenRequest = factory.tokenRequest();
            org.cloudfoundry.identity.client.token.GrantType grantType;
            // tokenRequest.setGrantType(GrantType.CLIENT_CREDENTIALS);
            tokenRequest.setGrantType(GrantType.CLIENT_CREDENTIALS);
            tokenRequest.setClientId(clientid);
            tokenRequest.setClientSecret(clientsecret);
            UaaContext xsuaaContext = factory.authenticate(tokenRequest);
            CompositeAccessToken accessToken = xsuaaContext.getToken();
            this.jwtToken = accessToken.getValue();
             LOGGER.error( "jwtToken:" +jwtToken);
             //***************retrieve token End*****************

            return new InetSocketAddress(proxyHost, proxyPort);
        } catch (Exception ex) {
            ex.printStackTrace();
            throw new IllegalStateException("Unable to extract the SOCKS5 proxy host and port", ex);
        }
    }
 
    private JSONObject extractEnvironmentCredentials() throws JSONException {
        JSONObject jsonObj = new JSONObject(System.getenv("VCAP_SERVICES"));
        JSONArray jsonArr = jsonObj.getJSONArray("connectivity");
        return jsonArr.getJSONObject(0).getJSONObject("credentials");
    }
 
    @Override
    public void connect(SocketAddress endpoint, int timeout) throws IOException {
        super.connect(getProxyAddress(), timeout);
 
        OutputStream outputStream = getOutputStream();
 
        executeSOCKS5InitialRequest(outputStream);
 
        executeSOCKS5AuthenticationRequest(outputStream);
 
        executeSOCKS5ConnectRequest(outputStream, (InetSocketAddress) endpoint);
    }
 
    private void executeSOCKS5InitialRequest(OutputStream outputStream) throws IOException {
        byte[] initialRequest = createInitialSOCKS5Request();
        outputStream.write(initialRequest);
 
        assertServerInitialResponse();
    }
 
    private byte[] createInitialSOCKS5Request() throws IOException {
        ByteArrayOutputStream byteArraysStream = new ByteArrayOutputStream();
        try {
            byteArraysStream.write(SOCKS5_VERSION);
            byteArraysStream.write(SOCKS5_AUTHENTICATION_METHODS_COUNT);
            byteArraysStream.write(SOCKS5_JWT_AUTHENTICATION_METHOD);
            return byteArraysStream.toByteArray();
        } finally {
            byteArraysStream.close();
        }
    }
 
    private void assertServerInitialResponse() throws IOException {
        InputStream inputStream = getInputStream();
 
        int versionByte = inputStream.read();
        if (SOCKS5_VERSION != versionByte) {
            throw new SocketException(String.format("Unsupported SOCKS version - expected %s, but received %s", SOCKS5_VERSION, versionByte));
        }
 
        int authenticationMethodValue = inputStream.read();
        if (SOCKS5_JWT_AUTHENTICATION_METHOD_UNSIGNED_VALUE != authenticationMethodValue) {
            throw new SocketException(String.format("Unsupported authentication method value - expected %s, but received %s",
                    SOCKS5_JWT_AUTHENTICATION_METHOD_UNSIGNED_VALUE, authenticationMethodValue));
        }
    }
 
    private void executeSOCKS5AuthenticationRequest(OutputStream outputStream) throws IOException {
        byte[] authenticationRequest = createJWTAuthenticationRequest();
        outputStream.write(authenticationRequest);
 
        assertAuthenticationResponse();
    }
 
    private byte[] createJWTAuthenticationRequest() throws IOException {
        ByteArrayOutputStream byteArraysStream = new ByteArrayOutputStream();
        try {
            byteArraysStream.write(SOCKS5_JWT_AUTHENTICATION_METHOD_VERSION);
            byteArraysStream.write(ByteBuffer.allocate(4).putInt(jwtToken.getBytes().length).array());
            byteArraysStream.write(jwtToken.getBytes());
            byteArraysStream.write(ByteBuffer.allocate(1).put((byte) sccLocationId.getBytes().length).array());
            byteArraysStream.write(sccLocationId.getBytes());
            return byteArraysStream.toByteArray();
        } finally {
            byteArraysStream.close();
        }
    }
 
    private void assertAuthenticationResponse() throws IOException {
        InputStream inputStream = getInputStream();
 
        int authenticationMethodVersion = inputStream.read();
        if (SOCKS5_JWT_AUTHENTICATION_METHOD_VERSION != authenticationMethodVersion) {
            throw new SocketException(String.format("Unsupported authentication method version - expected %s, but received %s",
                    SOCKS5_JWT_AUTHENTICATION_METHOD_VERSION, authenticationMethodVersion));
        }
 
        int authenticationStatus = inputStream.read();
        LOGGER.error( "authenticationStatus:" +authenticationStatus);
        if (SOCKS5_AUTHENTICATION_SUCCESS_BYTE != authenticationStatus) {
        //if (255!= authenticationStatus) {
            throw new SocketException("Authentication failed!");
        }
    }
 
    private void executeSOCKS5ConnectRequest(OutputStream outputStream, InetSocketAddress endpoint) throws IOException {
        byte[] commandRequest = createConnectCommandRequest(endpoint);
        outputStream.write(commandRequest);
 
        assertConnectCommandResponse();
    }
 
    private byte[] createConnectCommandRequest(InetSocketAddress endpoint) throws IOException {
        String host = endpoint.getHostName();
        int port = endpoint.getPort();
        ByteArrayOutputStream byteArraysStream = new ByteArrayOutputStream();
        try {
            byteArraysStream.write(SOCKS5_VERSION);
            byteArraysStream.write(SOCKS5_COMMAND_CONNECT_BYTE);
            byteArraysStream.write(SOCKS5_COMMAND_REQUEST_RESERVED_BYTE);
            byte[] hostToIPv4 = parseHostToIPv4(host);
            if (hostToIPv4 != null) {
                byteArraysStream.write(SOCKS5_COMMAND_ADDRESS_TYPE_IPv4_BYTE);
                byteArraysStream.write(hostToIPv4);
            } else {
                byteArraysStream.write(SOCKS5_COMMAND_ADDRESS_TYPE_DOMAIN_BYTE);
                byteArraysStream.write(ByteBuffer.allocate(1).put((byte) host.getBytes().length).array());
                byteArraysStream.write(host.getBytes());
            }
            byteArraysStream.write(ByteBuffer.allocate(2).putShort((short) port).array());
            return byteArraysStream.toByteArray();
        } finally {
            byteArraysStream.close();
        }
    }
 
    private void assertConnectCommandResponse() throws IOException {
        InputStream inputStream = getInputStream();
 
        int versionByte = inputStream.read();
        if (SOCKS5_VERSION != versionByte) {
            throw new SocketException(String.format("Unsupported SOCKS version - expected %s, but received %s", SOCKS5_VERSION, versionByte));
        }
 
        int connectStatusByte = inputStream.read();
        assertConnectStatus(connectStatusByte);
 
        readRemainingCommandResponseBytes(inputStream);
    }
 
    private void assertConnectStatus(int commandConnectStatus) throws IOException {
        if (commandConnectStatus == 0) {
            return;
        }
 
        String commandConnectStatusTranslation;
        switch (commandConnectStatus) {
            case 1:
                commandConnectStatusTranslation = "FAILURE";
                break;
            case 2:
                commandConnectStatusTranslation = "FORBIDDEN";
                break;
            case 3:
                commandConnectStatusTranslation = "NETWORK_UNREACHABLE";
                break;
            case 4:
                commandConnectStatusTranslation = "HOST_UNREACHABLE";
                break;
            case 5:
                commandConnectStatusTranslation = "CONNECTION_REFUSED";
                break;
            case 6:
                commandConnectStatusTranslation = "TTL_EXPIRED";
                break;
            case 7:
                commandConnectStatusTranslation = "COMMAND_UNSUPPORTED";
                break;
            case 8:
                commandConnectStatusTranslation = "ADDRESS_UNSUPPORTED";
                break;
            default:
                commandConnectStatusTranslation = "UNKNOWN";
                break;
        }
        throw new SocketException("SOCKS5 command failed with status: " + commandConnectStatusTranslation);
    }
 
    private byte[] parseHostToIPv4(String hostName) {
        byte[] parsedHostName = null;
        String[] virtualHostOctets = hostName.split("\\.", -1);
        int octetsCount = virtualHostOctets.length;
        if (octetsCount == 4) {
            try {
                byte[] ipOctets = new byte[octetsCount];
                for (int i = 0; i < octetsCount; i++) {
                    int currentOctet = Integer.parseInt(virtualHostOctets[i]);
                    if ((currentOctet < 0) || (currentOctet > 255)) {
                        throw new IllegalArgumentException(String.format("Provided octet %s is not in the range of [0-255]", currentOctet));
                    }
                    ipOctets[i] = (byte) currentOctet;
                }
                parsedHostName = ipOctets;
            } catch (IllegalArgumentException ex) {
                return null;
            }
        }
 
        return parsedHostName;
    }
 
    private void readRemainingCommandResponseBytes(InputStream inputStream) throws IOException {
        inputStream.read(); // skipping over SOCKS5 reserved byte
        int addressTypeByte = inputStream.read();
        if (SOCKS5_COMMAND_ADDRESS_TYPE_IPv4_BYTE == addressTypeByte) {
            for (int i = 0; i < 6; i++) {
                inputStream.read();
            }
        } else if (SOCKS5_COMMAND_ADDRESS_TYPE_DOMAIN_BYTE == addressTypeByte) {
            int domainNameLength = inputStream.read();
            int portBytes = 2;
            inputStream.read(new byte[domainNameLength + portBytes], 0, domainNameLength + portBytes);
        }
    }
}