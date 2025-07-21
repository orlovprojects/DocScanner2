import { useEffect, useState } from 'react';
import "../styles/infoPage.css/";
import { Helmet } from 'react-helmet';
import { Container, Box, Typography, Button } from '@mui/material';
import axios from 'axios';
import config from '../config';

const MySubscriptions = () => {
    const [subscriptionInfo, setSubscriptionInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Функция для получения информации о подписке
    const fetchSubscriptionInfo = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(`${config.BASE_API_URL}subscription-info/`, {
                headers: {
                    'Content-Type': 'application/json',
                },
                withCredentials: true, // Если требуется куки для авторизации
            });
            setSubscriptionInfo(response.data);
        } catch (error) {
            console.error("Error fetching subscription info:", error);
            setError("Failed to load subscription information.");
        } finally {
            setLoading(false);
        }
    };

    // Загружаем информацию о подписке при монтировании компонента
    useEffect(() => {
        fetchSubscriptionInfo();
    }, []);

    const handleCancelSubscription = async () => {
        try {
            const response = await axios.post(`${config.BASE_API_URL}stripe/cancel/`, {}, {
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            console.log("Subscription canceled successfully:", response.data);
            // Повторно запросить данные о подписке
            fetchSubscriptionInfo();
        } catch (error) {
            console.error("Error canceling subscription:", error);
            alert("Failed to cancel subscription. Please try again.");
        }
    };

    if (loading) {
        return (
            <Container>
                <Typography>Loading subscription information...</Typography>
            </Container>
        );
    }

    if (error) {
        return (
            <Container>
                <Typography color="error">{error}</Typography>
            </Container>
        );
    }

    return (
        <Container
            maxWidth={false}
            disableGutters
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                bgcolor: '#f9f9f9',
                padding: { xs: 2, sm: 3, md: 4 }
            }}
        >
            <Helmet>
                <title>My subscriptions - Seasonality Chart</title>
                <meta name="description" content="Update or cancel your SeasonalityChart subscriptions" />
            </Helmet>

            <Box
                sx={{
                    textAlign: 'center',
                    maxWidth: '600px',
                    padding: { xs: 2, sm: 3 },
                    bgcolor: 'white',
                    borderRadius: 2,
                    boxShadow: 3
                }}
            >
                <Typography
                    variant="h1"
                    sx={{
                        fontSize: { xs: '2rem', sm: '2.5rem' },
                        marginBottom: 2,
                        fontWeight: 'bold'
                    }}
                >
                    My subscriptions
                </Typography>

                {subscriptionInfo && (
                    <>
                        <Typography variant="body1" sx={{ marginBottom: 2 }}>
                            <strong>Status:</strong> {subscriptionInfo.subscription_status}
                        </Typography>
                        <Typography variant="body1" sx={{ marginBottom: 2 }}>
                            <strong>Plan:</strong> {subscriptionInfo.subscription_plan === 'trial' ? 'Trial' : subscriptionInfo.subscription_plan}
                        </Typography>
                        {subscriptionInfo.subscription_status === 'active' && (
                            <>
                                <Typography variant="body1" sx={{ marginBottom: 2 }}>
                                    <strong>Renewal Date:</strong> {subscriptionInfo.subscription_end_date}
                                </Typography>
                                <Button
                                    variant="contained"
                                    color="error"
                                    onClick={handleCancelSubscription}
                                    sx={{
                                        bgcolor: 'black',
                                        '&:hover': {
                                            bgcolor: '#f5be0d',
                                            color: 'black',
                                        },
                                        padding: '10px 20px',
                                        marginTop: 2,
                                    }}
                                >
                                    Cancel Subscription
                                </Button>
                            </>
                        )}
                        {subscriptionInfo.subscription_status === 'canceled' && (
                            <>
                                <Typography variant="body1" sx={{ marginBottom: 2 }}>
                                    <strong>Cancelation Date:</strong> {subscriptionInfo.subscription_end_date}
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'gray', marginTop: 1 }}>
                                    Your plan will remain active until the cancelation date but you won't be charged again.
                                </Typography>
                            </>
                        )}
                        {subscriptionInfo.subscription_status === 'trial' && (
                            <>
                                <Typography variant="body1" sx={{ marginBottom: 2 }}>
                                    <strong>Trial End Date:</strong> {subscriptionInfo.subscription_end_date}
                                </Typography>
                                <Button
                                    variant="contained"
                                    color="primary"
                                    href="/papildyti"
                                    sx={{
                                        bgcolor: 'black',
                                        '&:hover': {
                                            bgcolor: '#f5be0d',
                                            color: 'black',
                                        },
                                        padding: '10px 20px',
                                        marginTop: 2,
                                    }}
                                >
                                    Get Full Access
                                </Button>
                            </>
                        )}
                    </>
                )}
            </Box>
        </Container>
    );
};

export default MySubscriptions;