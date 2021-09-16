
const ROLE_SELLER = 'SELLER';
const ROLE_CUSTOMER = 'CUSTOMER';

let ROLE;

var mApplicationId;
var mUserId;
var mToken;

var sb;
var mConnectedUser;
var mChannels;
var mSelectedChannel;
var mAllMessages;
var mSelectedMessage;

var mProductsAddedToNewOrder = [];


function connect() {
    mApplicationId = document.getElementById('applicationId').value;
    mUserId = document.getElementById('userId').value;
    sb = new SendBird({ appId: mApplicationId });
    sb.connect(mUserId, function (user, error) {
        if (error) {
            alert('Error connecting!');
            return;
        }
        mConnectedUser = user;
        console.log('Connected as ' + mConnectedUser.userId);
        localStorage.setItem('userId', mConnectedUser.userId);
        addHandlers();
        toggleDiv(false, 'card-login', () => {
            toggleDiv(true, 'card-channels', () => {
                setCustomControlsForRole();
                getMyChannels();
            })
        })
    });
}

function addHandlers() {
    var channelHandler = new sb.ChannelHandler();
    channelHandler.onChannelChanged = (channel) => {
        getMyChannels();
        selectedChannel(channel.url);
    };
    channelHandler.onChannelChanged = (channel) => {
        getMyChannels(() => {
            selectedChannel(channel.url);
        });
    };
    sb.addChannelHandler('UNIQUE_HANDLER_ID', channelHandler);
}

function setCustomControlsForRole() {
    if (ROLE == ROLE_SELLER) {
        toggleDiv(true, 'card-send-order', () => {});
        document.getElementById('role-label').innerHTML = 'SELLER';
    } else {
        document.getElementById('role-label').innerHTML = 'CUSTOMER';
    }
}

function getMyChannels(callback = null) {
    var listQuery = sb.GroupChannel.createMyGroupChannelListQuery();
    listQuery.includeEmpty = true;
    listQuery.memberStateFilter = 'joined_only';
    listQuery.order = 'latest_last_message';
    listQuery.limit = 100;
    if (listQuery.hasNext) {
        listQuery.next(function (groupChannels, error) {
            if (error) {
                alert('Error listing your channels!');
                return;
            }
            mChannels = groupChannels;
            drawChannelList(groupChannels, 'channelList');
            if (callback) {
                callback();
            }
        });
    }
}


function drawChannelList(channels, targetDivId) {
    let out = `<ul class="list-group">`;
    channels.forEach(channel => {
        out += `
            <li 
                id="channel-${ channel.url }" 
                class="list-group-item pointer small" 
                onclick="selectedChannel('${ channel.url }')"
                >
                ${ channel.name ? channel.name : 'No name' }
            </li>
        `;
    })
    out += `</ul>`;
    document.getElementById(targetDivId).innerHTML = out;
}


function selectedChannel(channelUrl) {
    for (let channel of mChannels) {
        document.getElementById('channel-' + channel.url).classList.remove('active');
    }
    const channelEle = document.getElementById('channel-' + channelUrl);
    if (channelEle) {
        document.getElementById('channel-' + channelUrl).classList.add('active');
        mSelectedChannel = mChannels.find(i => i.url == channelUrl);
        getMessagesFromSelectedChannel();
    } else {
        sb.GroupChannel.getChannel(channelUrl, (channel, error) => {
            if (!error) {
                mSelectedChannel = channel;
                getMessagesFromSelectedChannel();
            }
        })
    }
}


function getMessagesFromSelectedChannel(timestamp = new Date().getTime(), prevAmount = 100, nextAmount = 0) {
    if (!mSelectedChannel) {
        alert('Please select a channel from the list.');
        return;
    }
    const params = new sb.MessageListParams();
    params.prevResultSize = prevAmount;
    params.nextResultSize = nextAmount;
    params.isInclusive = false;
    params.reverse = false;
    params.includeReplies = true;
    params.includeThreadInfo = true;
    params.includeParentMessageText = true;
    params.includeMetaArray = true;
    params.includeReaction = true;
    mSelectedChannel.getMessagesByTimestamp(timestamp, params, (messages, error) => {
        if (error) {
            alert('Error recovering messages');
            return;
        }
        mAllMessages = messages;
        drawAllMessages();
        showPendingOrders();
    })
}


function drawAllMessages() {
    let out = ``;
    for (let message of mAllMessages) {
        if (message && message.sender) {
            if (message.sender.userId == mConnectedUser.userId) {
                out += createRightBubble(message);
            } else {
                out += createLeftBubble(message);
            }    
        }
    }
    $('#card-messages').show();
    document.getElementById('messages').innerHTML = out;
}


function createLeftBubble(message) {
    console.dir(message);
    let c = message.data && message.data.trim().length > 0 ? getCuestionare(message) : '';
    let out = `
    <table class="mb-3">
        <tr>
            <td width="50" align="center" valign="top">
                <div class="avatar">
                    <img src="https://static.sendbird.com/sample/cover/cover_11.jpg" />
                </div>
            </td>
            <td>
                <div class="bubble-left">
                    ${ message.message }
                    ${ c }
                </div>
            </td>
        </tr>
    </table>
    <div></div>
    `;
    return out;
}

function createRightBubble(message) {
    console.dir(message);
    let c = message.data && message.data.trim().length > 0 ? getCuestionare(message) : '';
    let out = `
    <div class="mb-3 w-100 d-flex justify-content-end">
        <table>
            <tr>
                <td>
                    <div class="bubble">
                        ${ message.message }
                        ${ c }
                    </div>
                </td>
                <td width="50" align="center" valign="top">
                    <div class="avatar">
                        <img src="https://static.sendbird.com/sample/cover/cover_11.jpg" />
                    </div>
                </td>
            </tr>
        </table>
    </div>
    `;
    return out;
}


function getCuestionare(message) {
    try {
        /**
         * Parse DATA from message
         */
         const data = JSON.parse( message.data );
         if (!data || data.length == 0) {
             return '';
         }
         console.dir(data);
         const jsonProducts = data && data.products && Array.isArray( data.products ) ? data.products : [];
         const orderStatus = data.orderStatus; 
        /**
         * Start building the TABLE element
         */
        const visible = orderStatus == 'confirmed' ? 'display:none;' : '';
        const butShowProductList = orderStatus == 'confirmed' ? `
        <div class="mt-2 mb-2 text-center" id="but-show-product-list-for-${ message.messageId }">
            <button class="btn btn-secondary btn-sm" onclick="showProductList('${ message.messageId }')">
                Show products
            </button>
        </div>
        ` : '';
        let products = `
        <table id="list-of-products-for-${ message.messageId }" class="table table-bordered bg-white mt-2" style="border-radius:10px; ${ visible }">
        <tr>
            <th>Name</th>
            <th>Amount</th>
            <th>Unit</th>
            <th>Total</th>
            <th></th>
        </tr>
        `;
        /**
         * Textarea
         */
        const textareaObject = `
        <textarea 
            id="description-for-${ message.messageId }" 
            ${ orderStatus == 'confirmed' ? 'disabled' : '' }
            class="form-control form-control-sm mt-3 border-0 radius-10 shadow-sm disable-resize" 
            placeholder="Any comments?"
        ></textarea>`;
        let textarea = textareaObject;
        if (orderStatus == 'confirmed' && isThisSeller()) {
            textarea = '<div class="mt-2 mb-2 text-center">Customer comments: ' + data.comments + '</div>';
        }             
        if (orderStatus == 'confirmed' && !isThisSeller()) {
            textarea = '<div class="mt-2 mb-2 text-center">Your comments: ' + data.comments + '</div>';
        }
        if (orderStatus != 'confirmed' && isThisSeller()) {
            textarea = '';
        }
        /**
         * Button CONFIRM
         */
        let confirmArea = `<table align="center" class="mb-2 mt-2">
            <tr>
                <td colspan="2" align="center">
                    <div class="small mb-2">
                        Click on the Confirm button <br> 
                        to send your order.
                    </div>
                </td>
            </tr>
            <tr align="center">
                <td>
                    <button class="btn btn-success btn-sm" onclick="confirmOrder('${ message.messageId }')">
                        Confirm
                    </button>            
                </td>
            </tr>
        </table>`;
        if (orderStatus == 'confirmed' && isThisSeller()) {
            confirmArea = '<div class="text-center mt-2">You sent this order and customer accepted it.</div>'; 
        }
        if (orderStatus == 'confirmed' && !isThisSeller()) {
            confirmArea = '<div class="text-center mt-2">Seller sent this order and you accepted it.</div>'; 
        }
        if (orderStatus != 'confirmed' && isThisSeller()) {
            confirmArea = '<div class="text-center mt-2">Waiting for customer to confirm the order.</div>'; 
        }
        /**
         * Build the TABLE content 
         */
        let grandTotal = 0;
        for (let item of jsonProducts) {
            const productId = item.id;
            const name = item.name;
            if (!item.inStock) {
                item.cant = 0;
            }
            const cant = item.cant;
            const price = item.price;
            const measure = item.measure;
            const description = item.description;
            const total = (!isNaN( cant )) ? (cant * price).toFixed(2) : '0.00';
            grandTotal += parseFloat( total );
            const inStock = item.inStock ? `
                <span class="text-success">
                    Available
                </span>    
            ` : `
                <span class="text-danger">
                    Out of stock
                </span>
            `;
            let butRemoveFromStock = '';
            if (isThisSeller() && orderStatus == 'confirmed' && item.inStock) { 
                butRemoveFromStock = `
                    <div class="mt-2">
                        <button class="btn btn-danger btn-sm" onclick="markProductAsNotAvailable('${ message.messageId }', '${ productId }')">
                            Mark as Not available
                        </button>
                    </div>
                `;
            }
            if (!isThisSeller() && orderStatus == 'confirmed' && item.inStock) {
                butRemoveFromStock = `
                    <div class="mt-2 small">
                        Preparing...
                    </div>
                `;    
            }
            products += `            
                <tr>
                    <td style="min-width:200px">
                        <b>${ name }</b> <br>
                        Unit: <b>${ measure } </b> <br>
                        <small>${ description }</small>
                    </td>
                    <td>
                        <input 
                            id="cant-${ message.messageId }-for-${productId }" ${ orderStatus == 'confirmed' ? 'disabled' : '' }
                            ${ isThisSeller() ? 'disabled' : '' }
                            type="number" 
                            class="form-control form-control-sm" 
                            value="${ item.cant }" 
                            onchange="changeAmountToBuy(this, '${ productId }', '${ message.messageId }', '${ price }')" 
                            style="width:60px" 
                            />
                    </td>
                    <td align="right">
                        $${ price.toFixed(2) }
                    </td>
                    <td align="right">
                        $<span id="total-${ message.messageId }-for-${ productId }">${ total }</span>
                    </td>
                    <td align="center">
                        ${ inStock }
                        ${ butRemoveFromStock }
                    </td>
                </tr>
            `;
        }
        /**
         * TOTAL
         */
        products += `
            <tr>
                <td></td>
                <td></td>
                <td>
                    <b><span id="total-cant-for-${ message.messageId }"></span></b>
                </td>
                <td></td>
                <td align="right">
                    <b>$<span id="total-amunt-for-${ message.messageId }">${ grandTotal.toFixed(2) }</span></b>
                </td>
                <td></td>
            </tr>
        `;
        /**
         * End product TABLE
         */
        products += '</table>';
        /**
         * Put all the pieces together
         * and return
         */
        let out = butShowProductList + products + textarea + confirmArea;
        return out;
    } catch(error) {
        console.dir(error);
        return '';
    }
}

function changeAmountToBuy(ele, productId, messageId, unit) {
    const message = mAllMessages.find(i => i.messageId == messageId);
    if (!message) {
        return;
    }
    const data = JSON.parse( message.data );
    if (!data || data.length == 0) {
        return '';
    }
    const jsonProducts = data && data.products && Array.isArray( data.products ) ? data.products : [];
    let grandTotal = 0;
    for (let item of jsonProducts) {
        const price = item.price;
        const totalFor =  document.getElementById('total-' + messageId + '-for-' + item.id);
        let total =  parseFloat( ele.value ) * parseFloat( price );
        if (productId == item.id) {
            totalFor.innerHTML = total.toFixed(2);        
        }
        grandTotal += parseFloat( totalFor.innerHTML );    
    }
    document.getElementById('total-amunt-for-' + messageId).innerHTML = grandTotal.toFixed(2);
}

function confirmOrder(messageId) {
    const description = document.getElementById('description-for-' + messageId);
    const message = mAllMessages.find(i => i.messageId == messageId);
    const data = JSON.parse( message.data );
    const jsonProducts = data && data.products && Array.isArray( data.products ) ? data.products : [];
    for (let item of jsonProducts) {
        if (!item.inStock) {
            item.cant = 0;
        }
        item.cant = parseFloat( document.getElementById('cant-' + messageId + '-for-' + item.id ).value );
    }
    data.orderStatus = 'confirmed';
    data.comments = description.value;
    updateMessageWithCustomType( parseInt(messageId), JSON.stringify( data ), 'MARKETING', (success) => {
        if (!success) {
            alert('Error confirming this order. Please try again.');
        } else {
            sendResponseToCampaignAccepted(parseInt(messageId), JSON.stringify( data ), () => {
                getMessagesFromSelectedChannel();
            });
        }
    })
}

function markProductAsNotAvailable(messageId, productId) {
    const message = mAllMessages.find(i => i.messageId == messageId);
    const data = JSON.parse( message.data );
    const jsonProducts = data && data.products && Array.isArray( data.products ) ? data.products : [];
    for (let item of jsonProducts) {
        if (item.id == productId) {
            item.inStock = false;
        }
    }
    data.orderStatus = 'sent';
    sendResponseToProductOutOfStock(parseInt(messageId), JSON.stringify( data ), () => {
        getMessagesFromSelectedChannel();
    });
}


function updateMessage(messageId, data, callback) {
    const params = new sb.UserMessageParams();
    params.data = data;
    mSelectedChannel.updateUserMessage(messageId, params, (message, error) => {
        if (error) {
            console.dir(error);
            callback( false );
        } else {
            callback( true );
        }
    })
}

function updateMessageWithCustomType(messageId, data, customType, callback) {
    const params = new sb.UserMessageParams();
    params.data = data;
    params.customType = customType;
    mSelectedChannel.updateUserMessage(messageId, params, (message, error) => {
        if (error) {
            console.dir(error);
            callback( false );
        } else {
            callback( true );
        }
    })
}

function sendResponseToCampaignAccepted(messageId, data, callback) {
    const params = new sb.UserMessageParams();
    params.parentMessageId = messageId;
    params.message = 'Order confirmed!';
    params.data = data;
    mSelectedChannel.sendUserMessage(params, (message, error) => {
        if (error) {
            console.dir(error);
            alert('Error confirming this order')
        } else {
            callback();
        }
    })
}

function sendResponseToProductOutOfStock(messageId, data, callback) {
    const params = new sb.UserMessageParams();
    params.parentMessageId = messageId;
    params.message = 'Product not available. Please confirm order!';
    params.data = data;
    params.customType = 'MARKETING|PENDING';
    mSelectedChannel.sendUserMessage(params, (message, error) => {
        if (error) {
            console.dir(error);
            alert('Error responding to product with no stock')
        } else {
            callback();
        }
    })
}

function addToOrderAndRedraw() {
    addToOrder();
    drawProductsAddedToOrder();
}

function addToOrder() {
    const newCampaignProductIdEle = document.getElementById('newCampaignProductId');
    const newCampaignProductNameEle = document.getElementById('newCampaignProductName');
    const newCampaignProductDescEle = document.getElementById('newCampaignProductDesc');
    const newCampaignProductUnitEle = document.getElementById('newCampaignProductUnit');
    const newCampaignProductPriceEle = document.getElementById('newCampaignProductPrice');
    if (!newCampaignProductIdEle.value || !newCampaignProductNameEle.value || !newCampaignProductDescEle.value || !newCampaignProductUnitEle.value || !newCampaignProductPriceEle.value) {
        return;
    }
    mProductsAddedToNewOrder.push({
        id: newCampaignProductIdEle.value,
        name: newCampaignProductNameEle.value,
        description: newCampaignProductDescEle.value,
        measure: newCampaignProductUnitEle.value,
        cant: 0,
        price: parseFloat( newCampaignProductPriceEle.value ),
        inStock: true
    })
    newCampaignProductIdEle.value = '';
    newCampaignProductNameEle.value = '';
    newCampaignProductDescEle.value = '';
    newCampaignProductUnitEle.value = '';
    newCampaignProductPriceEle.value = '';
}

function drawProductsAddedToOrder() {
    let out = `<table class="table table-bordered">`;
    out += `<tr>
        <th>ID</th>
        <th>Product</th>
        <th>Unit</th>
        <th>Price</th>
    </tr>`;
    for (let item of mProductsAddedToNewOrder) {
        out += `
        <tr>
            <td>${ item.id }</td>
            <td style="max-width:400px">
                ${ item.name } <br>
                ${ item.description }
            </td>
            <td>${ item.measure }</td>
            <td>$${ (item.price).toFixed(2) }</td>
        </tr>`;
    }
    out += `</table>`;
    /**
     * Campaign name
     * User to invite
     */
    out += `
    <div class="alert alert-primary mt-2" role="alert">
        <table width="100%">
            <tr>
                <td>
                    Campaign name:
                </td>
                <td>
                    <input id="newCampaignName" type="text" class="form-control form-control-sm radius-10" />
                </td>
            </tr>
            <tr>
                <td>
                    User ID to send this campaign to: 
                </td>
                <td>
                    <input id="newCampaignTargetUserId" type="text" class="form-control form-control-sm radius-10" />
                </td>
            </tr>
            <tr>
                <td colspan="2">
                    <div class="small text-center mt-2">
                        For this example we will invite 1 user but in real life you can invite all you need
                    </div>
                </td>
            </tr>
        </table>
    </div>
    `;
    /**
     * Message and button to send
     */
     out += `
        <div class="mt-2 text-center">
            <textarea 
                id="newCampaignProductMessage" 
                class="form-control mb-2 disable-resize" 
                placeholder="Add a message..."
                ></textarea>
            <button class="btn btn-primary" onclick="createCapmaign()">
                Send marketing campaign
            </button>
        </div>
    `;
    document.getElementById('productsToSend').innerHTML = out;
}

function createCapmaign() {
    if (!mProductsAddedToNewOrder || mProductsAddedToNewOrder.length == 0) {
        return;
    }
    const newCampaignProductMessageEle = document.getElementById('newCampaignProductMessage');
    const newCampaignNameEle = document.getElementById('newCampaignName');
    const newCampaignTargetUserIdEle = document.getElementById('newCampaignTargetUserId');
    if (!newCampaignProductMessageEle.value || !newCampaignNameEle.value || !newCampaignTargetUserIdEle.value) {
        return;
    }
    const data = {
        products: mProductsAddedToNewOrder,
        comments: '',
        orderStatus: 'sent',
        orderSubStatus: ''
    };
    const myUserId = mConnectedUser.userId;
    createGroupChannelAndInviteUsersAsOperator(
        newCampaignNameEle.value, 
        [myUserId, newCampaignTargetUserIdEle.value], (channel, error) => {
        if (error) {
            alert('Error creating group channel!');
        } else {
            selectedChannel(channel.url);
            setTimeout(() => {
                sendMessage(newCampaignProductMessageEle.value, data, 'MARKETING|PENDING');
            }, 100);
        }
    })
}

function createGroupChannelAndInviteUsersAsOperator(channelName, userIds, callback) {
    var params = new sb.GroupChannelParams();
    params.addUserIds( userIds );
    params.operatorUserIds = userIds;
    params.name = channelName;
    params.data = '';
    sb.GroupChannel.createChannel(params, callback);
}

function sendMessage(text = null, data = '', customType = null) {
    if (!mSelectedChannel) {
        alert('Please select a channel from the list.');
        return;
    }
    const params = new sb.UserMessageParams();
    const newMessage = document.getElementById('newMessage');
    if (!text) {
        if (!newMessage.value) {
            return;
        }
        params.message = newMessage.value;    
    } else {
        params.message = text;
    }
    params.data = JSON.stringify( data );
    if (customType) {
        params.customType = customType;
    }
    mSelectedChannel.sendUserMessage(params, (userMessage, error) => {
        if (error) {
            alert('Error sending message!');
            return;
        }
        newMessage.value = '';
        getMessagesFromSelectedChannel();
    })
}


function showPendingOrders() {
    if (!isThisSeller()) {
        return;
    }
    const params = new sb.MessageListParams();
    params.isInclusive = true;
    params.prevResultSize = 100;
    params.nextResultSize = 100;
    params.customType = 'MARKETING|PENDING';    
    params.includeReplies = true;
    mSelectedChannel.getMessagesByTimestamp(new Date().getTime(), params, (messages, error) => {
        console.log('Messages', messages);
        if (messages && messages.length > 0) {
            $('#card-pending-orders').show();
            document.getElementById('pendingOrders').innerHTML = messages.length + ' pending orders.';    
        } else {
            $('#card-pending-orders').hide();
            document.getElementById('pendingOrders').innerHTML = 'No pending orders.';    
        }
    })
}

function showProductList(messageId) {
    $('#but-show-product-list-for-' + messageId).hide();
    $('#list-of-products-for-' + messageId).fadeIn();
}

function isThisMyMessage(message) {
    return (message && message.sender && mConnectedUser && message.sender.userId == mConnectedUser.userId);
}

function isThisSeller() {
    return (ROLE == ROLE_SELLER);
}

function toggleDiv(show, divId, callback) {
    if (show) {
        $('#' + divId).fadeIn('fast', callback);
    } else {
        $('#' + divId).fadeOut('fast', callback);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const userId = localStorage.getItem('userId');
    if (userId) {
        document.getElementById('userId').value = userId;
        connect();
    }
}, false);
